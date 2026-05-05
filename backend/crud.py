"""Backend CRUD and workflow functions for the recruitment system."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from functools import lru_cache
import hashlib
import hmac
import secrets
from typing import Any, Callable, Mapping, Sequence, TypeVar

from sqlalchemy import Select, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.db import session_scope
from backend.models import (
    Account,
    Application,
    ApplicationStatusEnum,
    Candidate,
    Employer,
    JobPosition,
    RoleEnum,
)


T = TypeVar("T")


class BackendError(Exception):
    """Base exception for backend failures that the UI can display safely."""


class AuthenticationError(BackendError):
    """Raised when login credentials are invalid for a requested account."""


class AuthorizationError(BackendError):
    """Raised when a user attempts to access another owner's data."""


class NotFoundError(BackendError):
    """Raised when a requested entity does not exist."""


class ValidationError(BackendError):
    """Raised when user input violates business rules before or during persistence."""


@dataclass(frozen=True)
class AuthenticatedUser:
    """Represents the resolved identity stored in session state after login."""

    account_id: int
    email: str
    role: str
    employer_id: int | None
    candidate_id: int | None
    display_name: str


def auth_user_payload(user: AuthenticatedUser) -> dict[str, Any]:
    """Return the public user payload shared by login/register responses."""

    return {
        "account_id": user.account_id,
        "email": user.email,
        "role": user.role,
        "employer_id": user.employer_id,
        "candidate_id": user.candidate_id,
        "display_name": user.display_name,
    }


def validate_token_user(account_id: int, role: str, employer_id: int | None = None) -> None:
    """Ensure a JWT identity is still allowed to use protected endpoints."""

    def operation(session: Session) -> None:
        account = session.get(Account, account_id)
        if account is None:
            raise AuthenticationError("Invalid access token.")
        if _account_is_disabled(session, account_id):
            raise AuthorizationError("This account has been disabled.")
        if role == RoleEnum.EMPLOYER.value and employer_id is not None and _column_exists(session, "Employers", "ApprovalStatus"):
            approval = _fetch_one(
                session,
                "SELECT ApprovalStatus FROM Employers WHERE EmployerID = :employer_id",
                {"employer_id": employer_id},
            )
            if approval and approval.get("ApprovalStatus") != "Approved":
                raise AuthorizationError("This employer account is not approved.")

    _run_db(operation)


def _serialize_value(value: Any) -> Any:
    """Convert database-native values into UI-friendly plain Python values."""

    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    return value


def _serialize_mapping(row: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize row mappings returned from SQLAlchemy result sets."""

    return {key: _serialize_value(value) for key, value in row.items()}


def _run_db(operation: Callable[[Session], T]) -> T:
    """Wrap database work so CRUD code has one consistent error boundary."""

    try:
        with session_scope() as session:
            return operation(session)
    except BackendError:
        raise
    except IntegrityError as exc:
        raise ValidationError("The database rejected the operation due to invalid data.") from exc
    except SQLAlchemyError as exc:
        original_message = str(getattr(exc, "orig", exc))
        if "45000" in original_message:
            safe_message = original_message.split(":", 1)[-1].strip() or "The database rejected the operation."
            raise ValidationError(safe_message) from exc
        raise BackendError("A database error occurred while processing the request.") from exc


def _fetch_all(session: Session, sql: str, params: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run a read-only SQL statement and normalize the result rows."""

    result = session.execute(text(sql), params or {})
    return [_serialize_mapping(row) for row in result.mappings().all()]


def _fetch_one(session: Session, sql: str, params: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    """Run a SQL statement and return one normalized row if present."""

    result = session.execute(text(sql), params or {})
    row = result.mappings().first()
    return None if row is None else _serialize_mapping(row)


def _table_exists(session: Session, table_name: str) -> bool:
    """Return whether an optional migration table exists."""

    row = _fetch_one(
        session,
        """
        SELECT 1 AS ExistsFlag
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = :table_name
        LIMIT 1
        """,
        {"table_name": table_name},
    )
    return row is not None


def _column_exists(session: Session, table_name: str, column_name: str) -> bool:
    """Return whether an optional migration column exists."""

    row = _fetch_one(
        session,
        """
        SELECT 1 AS ExistsFlag
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = :table_name
          AND column_name = :column_name
        LIMIT 1
        """,
        {"table_name": table_name, "column_name": column_name},
    )
    return row is not None


def _account_is_disabled(session: Session, account_id: int) -> bool:
    """Check AccountStatus when the admin/security migration has been imported."""

    if not _column_exists(session, "Accounts", "AccountStatus"):
        return False
    row = _fetch_one(
        session,
        "SELECT AccountStatus FROM Accounts WHERE AccountID = :account_id",
        {"account_id": account_id},
    )
    return bool(row and row.get("AccountStatus") == "Disabled")


def _write_audit_log(
    session: Session,
    actor: AuthenticatedUser | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: str | None = None,
) -> None:
    """Persist an audit log when the optional AuditLogs table is available."""

    if not _table_exists(session, "AuditLogs"):
        return
    session.execute(
        text(
            """
            INSERT INTO AuditLogs (
                ActorAccountID,
                ActorRole,
                Action,
                EntityType,
                EntityID,
                Details
            )
            VALUES (
                :actor_account_id,
                :actor_role,
                :action,
                :entity_type,
                :entity_id,
                :details
            )
            """
        ),
        {
            "actor_account_id": None if actor is None else actor.account_id,
            "actor_role": None if actor is None else actor.role,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
        },
    )


def _create_notification(
    session: Session,
    account_id: int | None,
    title: str,
    message: str,
) -> None:
    """Create a notification when the optional Notifications table is available."""

    if account_id is None or not _table_exists(session, "Notifications"):
        return
    session.execute(
        text(
            """
            INSERT INTO Notifications (AccountID, Title, Message)
            VALUES (:account_id, :title, :message)
            """
        ),
        {"account_id": account_id, "title": title, "message": message},
    )


def log_audit(
    actor: AuthenticatedUser | None,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    details: str | None = None,
) -> None:
    """Write an audit log outside the main operation when possible."""

    try:
        normalized_entity_id = None if entity_id in (None, "") else int(entity_id)

        def operation(session: Session) -> None:
            _write_audit_log(session, actor, action, entity_type, normalized_entity_id, details)

        _run_db(operation)
    except BackendError:
        return
    except (TypeError, ValueError):
        return


def _call_procedure(
    session: Session,
    procedure_name: str,
    args: Sequence[Any],
) -> dict[str, Any]:
    """Execute a MySQL stored procedure and drain all result sets before commit."""

    raw_connection = session.connection().connection
    dbapi_connection = (
        getattr(raw_connection, "driver_connection", None)
        or getattr(raw_connection, "dbapi_connection", None)
        or raw_connection
    )
    cursor = dbapi_connection.cursor(dictionary=True)
    try:
        cursor.callproc(procedure_name, list(args))
        payload: dict[str, Any] = {}
        for stored_result in cursor.stored_results():
            rows = stored_result.fetchall()
            if rows and not payload:
                payload = _serialize_mapping(rows[0])
        return payload
    finally:
        cursor.close()


def _require_employer(session: Session, employer_id: int) -> Employer:
    """Load an employer or fail early so later ownership checks stay explicit."""

    employer = session.get(Employer, employer_id)
    if employer is None:
        raise NotFoundError("Employer not found.")
    return employer


def _require_candidate(session: Session, candidate_id: int) -> Candidate:
    """Load a candidate or fail early so later ownership checks stay explicit."""

    candidate = session.get(Candidate, candidate_id)
    if candidate is None:
        raise NotFoundError("Candidate not found.")
    return candidate


def _require_position_for_employer(session: Session, employer_id: int, position_id: int) -> JobPosition:
    """Ensure a job position exists and belongs to the requesting employer."""

    statement: Select[tuple[JobPosition]] = select(JobPosition).where(
        JobPosition.position_id == position_id,
        JobPosition.employer_id == employer_id,
    )
    position = session.execute(statement).scalar_one_or_none()
    if position is None:
        raise AuthorizationError("The requested job position is not available for this employer.")
    return position


def _require_application_for_employer(session: Session, employer_id: int, application_id: int) -> Application:
    """Ensure an application exists and is tied to one of the employer's positions."""

    statement: Select[tuple[Application]] = (
        select(Application)
        .join(JobPosition, JobPosition.position_id == Application.position_id)
        .where(
            Application.application_id == application_id,
            JobPosition.employer_id == employer_id,
        )
    )
    application = session.execute(statement).scalar_one_or_none()
    if application is None:
        raise AuthorizationError("The requested application is not available for this employer.")
    return application


def _account_email(email: str) -> str:
    """Normalize user email input before account lookup."""

    normalized = email.strip().lower()
    if not normalized:
        raise ValidationError("Email is required.")
    return normalized


PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 240_000
LEGACY_SCHEME = "sha256"
DEFAULT_DEMO_PASSWORD = "1"
LEGACY_GENERATOR_PASSWORD = "ChangeMe123!"


def _hash_password(password: str, *, salt: str | None = None) -> str:
    """Return a PBKDF2-based password hash string for persistent account auth."""

    password_value = password.strip()
    if not password_value:
        raise ValidationError("Password cannot be empty.")
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password_value.encode("utf-8"),
        salt_value.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${salt_value}${digest}"


def _legacy_hash(email: str, password: str) -> str:
    """Recreate the deterministic legacy demo hash used by old seed data."""

    digest = hashlib.sha256(f"{email}:{password}".encode("utf-8")).hexdigest()
    return f"{LEGACY_SCHEME}${digest}"


def _verify_password(password: str, stored_hash: str, email: str) -> bool:
    """Verify a submitted password against supported hash formats."""

    if not stored_hash:
        return False

    if stored_hash.startswith(f"{PASSWORD_SCHEME}$"):
        try:
            _, iterations_text, salt, expected = stored_hash.split("$", 3)
            iterations = int(iterations_text)
        except ValueError:
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        ).hex()
        return hmac.compare_digest(candidate, expected)

    if stored_hash.startswith(f"{LEGACY_SCHEME}$"):
        # Compatibility path:
        # old seed data used ChangeMe123!, while the app later switched to demo password "1".
        return password in {DEFAULT_DEMO_PASSWORD, LEGACY_GENERATOR_PASSWORD}

    return False


def _validate_new_password(new_password: str, confirm_password: str) -> str:
    """Validate password update input and return a normalized new password."""

    password_value = new_password.strip()
    if len(password_value) < 6:
        raise ValidationError("New password must contain at least 6 characters.")
    if password_value != confirm_password:
        raise ValidationError("Password confirmation does not match.")
    return password_value


def authenticate_user(email: str, password: str) -> AuthenticatedUser:
    """Authenticate a demo user and resolve the linked employer or candidate profile."""

    normalized_email = _account_email(email)
    submitted_password = password.strip()
    if not submitted_password:
        raise AuthenticationError("Invalid email or password.")

    def operation(session: Session) -> AuthenticatedUser:
        statement: Select[tuple[Account]] = select(Account).where(Account.email == normalized_email)
        account = session.execute(statement).scalar_one_or_none()
        if account is None:
            raise AuthenticationError("Invalid email or password.")
        if _account_is_disabled(session, account.account_id):
            raise AuthorizationError("This account has been disabled.")
        if not _verify_password(submitted_password, account.password_hash, account.email):
            raise AuthenticationError("Invalid email or password.")

        # Upgrade legacy demo hashes the first time they are used successfully.
        if account.password_hash.startswith(f"{LEGACY_SCHEME}$"):
            account.password_hash = _hash_password(submitted_password)
            session.add(account)

        if account.role == RoleEnum.EMPLOYER:
            employer = session.execute(
                select(Employer).where(Employer.account_id == account.account_id)
            ).scalar_one_or_none()
            if employer is None:
                raise NotFoundError("Employer profile is missing for this account.")
            if _column_exists(session, "Employers", "ApprovalStatus"):
                approval = _fetch_one(
                    session,
                    "SELECT ApprovalStatus FROM Employers WHERE EmployerID = :employer_id",
                    {"employer_id": employer.employer_id},
                )
                if approval and approval.get("ApprovalStatus") != "Approved":
                    raise AuthorizationError("This employer account is not approved.")
            return AuthenticatedUser(
                account_id=account.account_id,
                email=account.email,
                role=account.role.value,
                employer_id=employer.employer_id,
                candidate_id=None,
                display_name=employer.company_name,
            )

        if account.role == RoleEnum.ADMIN:
            return AuthenticatedUser(
                account_id=account.account_id,
                email=account.email,
                role=account.role.value,
                employer_id=None,
                candidate_id=None,
                display_name="Administrator",
            )

        candidate = session.execute(
            select(Candidate).where(Candidate.account_id == account.account_id)
        ).scalar_one_or_none()
        if candidate is None:
            raise NotFoundError("Candidate profile is missing for this account.")
        return AuthenticatedUser(
            account_id=account.account_id,
            email=account.email,
            role=account.role.value,
            employer_id=None,
            candidate_id=candidate.candidate_id,
            display_name=candidate.full_name,
        )

    return _run_db(operation)


def change_account_password(
    account_id: int,
    current_password: str,
    new_password: str,
    confirm_password: str,
) -> dict[str, Any]:
    """Change the password for the authenticated account after verifying the current one."""

    current_password_value = current_password.strip()
    if not current_password_value:
        raise ValidationError("Current password is required.")
    next_password = _validate_new_password(new_password, confirm_password)

    def operation(session: Session) -> dict[str, Any]:
        account = session.get(Account, account_id)
        if account is None:
            raise NotFoundError("Account not found.")
        if not _verify_password(current_password_value, account.password_hash, account.email):
            raise AuthenticationError("Current password is incorrect.")
        if _verify_password(next_password, account.password_hash, account.email):
            raise ValidationError("New password must be different from the current password.")

        account.password_hash = _hash_password(next_password)
        session.add(account)
        return {
            "AccountID": account.account_id,
            "Message": "Password updated successfully.",
        }

    result = _run_db(operation)
    clear_read_caches()
    return result


def register_candidate_account(
    email: str,
    password: str,
    confirm_password: str,
    full_name: str,
    date_of_birth: date | None,
    phone_number: str | None,
    resume_url: str | None,
) -> AuthenticatedUser:
    """Create a new candidate account plus candidate profile, then return the authenticated session payload."""

    normalized_email = _account_email(email)
    next_password = _validate_new_password(password, confirm_password)
    normalized_name = full_name.strip()
    if not normalized_name:
        raise ValidationError("Full name is required.")

    def operation(session: Session) -> AuthenticatedUser:
        existing_account = session.execute(
            select(Account).where(Account.email == normalized_email)
        ).scalar_one_or_none()
        if existing_account is not None:
            raise ValidationError("Email is already registered.")

        account = Account(
            email=normalized_email,
            password_hash=_hash_password(next_password),
            role=RoleEnum.CANDIDATE,
            created_at=datetime.now(),
        )
        session.add(account)
        session.flush()

        candidate = Candidate(
            account_id=account.account_id,
            full_name=normalized_name,
            date_of_birth=date_of_birth,
            phone_number=(phone_number or "").strip() or None,
            resume_url=(resume_url or "").strip() or None,
        )
        session.add(candidate)
        session.flush()

        return AuthenticatedUser(
            account_id=account.account_id,
            email=account.email,
            role=account.role.value,
            employer_id=None,
            candidate_id=candidate.candidate_id,
            display_name=candidate.full_name,
        )

    result = _run_db(operation)
    clear_read_caches()
    return result


def register_employer_account(
    email: str,
    password: str,
    confirm_password: str,
    company_name: str,
    contact_number: str | None,
    address: str | None,
    description: str | None,
) -> AuthenticatedUser:
    """Create a new employer account plus employer profile, then return the authenticated session payload."""

    normalized_email = _account_email(email)
    next_password = _validate_new_password(password, confirm_password)
    normalized_company_name = company_name.strip()
    if not normalized_company_name:
        raise ValidationError("Company name is required.")

    def operation(session: Session) -> AuthenticatedUser:
        existing_account = session.execute(
            select(Account).where(Account.email == normalized_email)
        ).scalar_one_or_none()
        if existing_account is not None:
            raise ValidationError("Email is already registered.")

        account = Account(
            email=normalized_email,
            password_hash=_hash_password(next_password),
            role=RoleEnum.EMPLOYER,
            created_at=datetime.now(),
        )
        session.add(account)
        session.flush()

        employer = Employer(
            account_id=account.account_id,
            company_name=normalized_company_name,
            contact_number=(contact_number or "").strip() or None,
            address=(address or "").strip() or None,
            description=(description or "").strip() or None,
        )
        session.add(employer)
        session.flush()
        if _column_exists(session, "Employers", "ApprovalStatus"):
            session.execute(
                text("UPDATE Employers SET ApprovalStatus = 'Pending' WHERE EmployerID = :employer_id"),
                {"employer_id": employer.employer_id},
            )

        return AuthenticatedUser(
            account_id=account.account_id,
            email=account.email,
            role=account.role.value,
            employer_id=employer.employer_id,
            candidate_id=None,
            display_name=employer.company_name,
        )

    result = _run_db(operation)
    clear_read_caches()
    return result


@lru_cache(maxsize=128)
def _get_employer_profile_cached(employer_id: int) -> dict[str, Any]:
    """Cached employer profile lookup for employer-owned screens."""

    def operation(session: Session) -> dict[str, Any]:
        employer = _require_employer(session, employer_id)
        return {
            "EmployerID": employer.employer_id,
            "AccountID": employer.account_id,
            "CompanyName": employer.company_name,
            "ContactNumber": employer.contact_number,
            "Address": employer.address,
            "Description": employer.description,
        }

    return _run_db(operation)


def get_employer_profile(employer_id: int) -> dict[str, Any]:
    """Return an employer profile for rendering employer-owned screens."""

    return deepcopy(_get_employer_profile_cached(employer_id))


@lru_cache(maxsize=128)
def _get_candidate_profile_cached(candidate_id: int) -> dict[str, Any]:
    """Cached candidate profile lookup for candidate-owned screens."""

    def operation(session: Session) -> dict[str, Any]:
        candidate = _require_candidate(session, candidate_id)
        return {
            "CandidateID": candidate.candidate_id,
            "AccountID": candidate.account_id,
            "FullName": candidate.full_name,
            "DateOfBirth": _serialize_value(candidate.date_of_birth),
            "PhoneNumber": candidate.phone_number,
            "ResumeURL": candidate.resume_url,
        }

    return _run_db(operation)


def get_candidate_profile(candidate_id: int) -> dict[str, Any]:
    """Return a candidate profile for rendering candidate-owned screens."""

    return deepcopy(_get_candidate_profile_cached(candidate_id))


def list_candidate_profiles(candidate_ids: list[int]) -> dict[int, dict[str, Any]]:
    """Return candidate profiles keyed by CandidateID for employer-side profile previews."""

    unique_ids = tuple(sorted({int(candidate_id) for candidate_id in candidate_ids if candidate_id}))
    if not unique_ids:
        return {}

    return deepcopy(_list_candidate_profiles_cached(unique_ids))


@lru_cache(maxsize=128)
def _list_candidate_profiles_cached(candidate_ids: tuple[int, ...]) -> dict[int, dict[str, Any]]:
    """Cached candidate profile preview lookup keyed by CandidateID tuple."""

    def operation(session: Session) -> dict[int, dict[str, Any]]:
        statement = (
            select(Candidate)
            .where(Candidate.candidate_id.in_(candidate_ids))
            .order_by(Candidate.full_name.asc())
        )
        candidates = session.execute(statement).scalars().all()
        return {
            candidate.candidate_id: {
                "CandidateID": candidate.candidate_id,
                "AccountID": candidate.account_id,
                "FullName": candidate.full_name,
                "DateOfBirth": _serialize_value(candidate.date_of_birth),
                "PhoneNumber": candidate.phone_number,
                "ResumeURL": candidate.resume_url,
            }
            for candidate in candidates
        }

    return _run_db(operation)


@lru_cache(maxsize=128)
def _get_employer_dashboard_metrics_cached(employer_id: int) -> dict[str, Any]:
    """Cached employer dashboard metrics lookup."""

    def operation(session: Session) -> dict[str, Any]:
        _require_employer(session, employer_id)
        metrics = _fetch_one(
            session,
            """
            SELECT *
            FROM vw_employer_dashboard_metrics
            WHERE EmployerID = :employer_id
            """,
            {"employer_id": employer_id},
        )
        if metrics is None:
            raise NotFoundError("Dashboard metrics are not available for this employer.")
        function_metrics = _fetch_one(
            session,
            """
            SELECT
                fn_employer_pass_rate(:employer_id) AS PassRate,
                fn_average_interview_score(:employer_id) AS FunctionAverageInterviewScore
            """,
            {"employer_id": employer_id},
        )
        if function_metrics:
            metrics.update(function_metrics)
        return metrics

    return _run_db(operation)


def get_employer_dashboard_metrics(employer_id: int) -> dict[str, Any]:
    """Return one row of dashboard metrics for the requesting employer only."""

    return deepcopy(_get_employer_dashboard_metrics_cached(employer_id))


def list_employer_pass_rate_years(employer_id: int) -> list[dict[str, Any]]:
    """Return years that have interview data for one employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        rows = _fetch_all(
            session,
            """
            SELECT DISTINCT YEAR(InterviewDate) AS Year
            FROM vw_interview_results
            WHERE EmployerID = :employer_id
            ORDER BY Year DESC
            """,
            {"employer_id": employer_id},
        )
        if rows:
            return rows
        return [{"Year": date.today().year}]

    return _run_db(operation)


@lru_cache(maxsize=256)
def _list_employer_monthly_pass_rate_cached(employer_id: int, year: int) -> list[dict[str, Any]]:
    """Return one row per month with pass-rate metrics for a selected year."""

    if year < 2000 or year > 2100:
        raise ValidationError("Trend year is outside the supported range.")

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT
                :year AS Year,
                months.MonthNumber,
                months.MonthLabel,
                COALESCE(monthly.TotalInterviews, 0) AS TotalInterviews,
                COALESCE(monthly.PassedInterviews, 0) AS PassedInterviews,
                CASE
                    WHEN COALESCE(monthly.TotalInterviews, 0) = 0 THEN 0.00
                    ELSE ROUND((monthly.PassedInterviews * 100.0) / monthly.TotalInterviews, 2)
                END AS PassRate
            FROM (
                SELECT 1 AS MonthNumber, 'Jan' AS MonthLabel
                UNION ALL SELECT 2, 'Feb'
                UNION ALL SELECT 3, 'Mar'
                UNION ALL SELECT 4, 'Apr'
                UNION ALL SELECT 5, 'May'
                UNION ALL SELECT 6, 'Jun'
                UNION ALL SELECT 7, 'Jul'
                UNION ALL SELECT 8, 'Aug'
                UNION ALL SELECT 9, 'Sep'
                UNION ALL SELECT 10, 'Oct'
                UNION ALL SELECT 11, 'Nov'
                UNION ALL SELECT 12, 'Dec'
            ) AS months
            LEFT JOIN (
                SELECT
                    MONTH(InterviewDate) AS MonthNumber,
                    COUNT(*) AS TotalInterviews,
                    SUM(CASE WHEN Result = 'Pass' THEN 1 ELSE 0 END) AS PassedInterviews
                FROM vw_interview_results
                WHERE EmployerID = :employer_id
                  AND YEAR(InterviewDate) = :year
                GROUP BY MONTH(InterviewDate)
            ) AS monthly
                ON monthly.MonthNumber = months.MonthNumber
            ORDER BY months.MonthNumber
            """,
            {"employer_id": employer_id, "year": year},
        )

    return _run_db(operation)


def list_employer_monthly_pass_rate(employer_id: int, year: int) -> list[dict[str, Any]]:
    """Return monthly pass-rate trend for one employer and year."""

    return deepcopy(_list_employer_monthly_pass_rate_cached(employer_id, year))


@lru_cache(maxsize=128)
def _list_employer_job_application_summary_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached per-position application performance rows for one employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_job_application_summary
            WHERE EmployerID = :employer_id
            ORDER BY TotalApplications DESC, PostedDate DESC, PositionID DESC
            """,
            {"employer_id": employer_id},
        )

    return _run_db(operation)


def list_employer_job_application_summary(employer_id: int) -> list[dict[str, Any]]:
    """Return per-position application performance rows for one employer only."""

    return deepcopy(_list_employer_job_application_summary_cached(employer_id))


@lru_cache(maxsize=128)
def _list_employer_job_positions_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached job positions owned by the requesting employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        statement = (
            select(JobPosition)
            .where(JobPosition.employer_id == employer_id)
            .order_by(JobPosition.posted_date.desc())
        )
        positions = session.execute(statement).scalars().all()
        return [
            {
                "PositionID": position.position_id,
                "EmployerID": position.employer_id,
                "Title": position.title,
                "JobDescription": position.job_description,
                "Requirements": position.requirements,
                "Status": _serialize_value(position.status),
                "PostedDate": _serialize_value(position.posted_date),
            }
            for position in positions
        ]

    return _run_db(operation)


def list_employer_job_positions(employer_id: int) -> list[dict[str, Any]]:
    """Return only the job positions owned by the requesting employer."""

    return deepcopy(_list_employer_job_positions_cached(employer_id))


@lru_cache(maxsize=128)
def _list_employer_applications_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached applications attached to positions owned by the employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_candidate_application_tracker
            WHERE EmployerID = :employer_id
            ORDER BY ApplicationDate DESC
            """,
            {"employer_id": employer_id},
        )

    return _run_db(operation)


def list_employer_applications(employer_id: int) -> list[dict[str, Any]]:
    """Return all applications attached to positions owned by the employer."""

    return deepcopy(_list_employer_applications_cached(employer_id))


@lru_cache(maxsize=128)
def _list_employer_pending_interview_candidates_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached employer-owned applications that are ready for interview scheduling."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_candidate_application_tracker
            WHERE EmployerID = :employer_id
              AND InterviewDate IS NULL
              AND ApplicationStatus IN ('Pending', 'Reviewed')
            ORDER BY ApplicationDate DESC, PositionID DESC
            """,
            {"employer_id": employer_id},
        )

    return _run_db(operation)


def list_employer_pending_interview_candidates(employer_id: int) -> list[dict[str, Any]]:
    """Return employer-owned applications that are ready for interview scheduling."""

    return deepcopy(_list_employer_pending_interview_candidates_cached(employer_id))


@lru_cache(maxsize=128)
def _list_shortlisted_candidates_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached shortlisted candidates for the requesting employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_shortlisted_candidates
            WHERE EmployerID = :employer_id
            ORDER BY CandidateName ASC
            """,
            {"employer_id": employer_id},
        )

    return _run_db(operation)


def list_shortlisted_candidates(employer_id: int) -> list[dict[str, Any]]:
    """Return shortlisted candidates only for the requesting employer."""

    return deepcopy(_list_shortlisted_candidates_cached(employer_id))


@lru_cache(maxsize=128)
def _list_employer_interview_results_cached(employer_id: int) -> list[dict[str, Any]]:
    """Cached interview results for applications owned by the employer."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_employer(session, employer_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_interview_results
            WHERE EmployerID = :employer_id
            ORDER BY InterviewDate DESC
            """,
            {"employer_id": employer_id},
        )

    return _run_db(operation)


def list_employer_interview_results(employer_id: int) -> list[dict[str, Any]]:
    """Return interview results only for applications owned by the employer."""

    return deepcopy(_list_employer_interview_results_cached(employer_id))


@lru_cache(maxsize=128)
def _list_open_job_positions_cached(search_term: str | None = None) -> list[dict[str, Any]]:
    """Cached global open job positions for candidate browsing."""

    def operation(session: Session) -> list[dict[str, Any]]:
        if search_term and search_term.strip():
            wildcard = f"%{search_term.strip()}%"
            return _fetch_all(
                session,
                """
                SELECT *
                FROM vw_open_job_positions
                WHERE Title LIKE :search
                   OR CompanyName LIKE :search
                   OR JobDescription LIKE :search
                   OR Requirements LIKE :search
                ORDER BY PostedDate DESC
                """,
                {"search": wildcard},
            )

        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_open_job_positions
            ORDER BY PostedDate DESC
            """,
        )

    return _run_db(operation)


def list_open_job_positions(search_term: str | None = None) -> list[dict[str, Any]]:
    """Return globally visible open job positions for candidate browsing."""

    normalized_search = None if search_term is None else search_term.strip()
    return deepcopy(_list_open_job_positions_cached(normalized_search or None))


@lru_cache(maxsize=128)
def _list_candidate_applications_cached(candidate_id: int) -> list[dict[str, Any]]:
    """Cached applications owned by the requesting candidate."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_candidate(session, candidate_id)
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_candidate_application_tracker
            WHERE CandidateID = :candidate_id
            ORDER BY ApplicationDate DESC
            """,
            {"candidate_id": candidate_id},
        )

    return _run_db(operation)


def list_candidate_applications(candidate_id: int) -> list[dict[str, Any]]:
    """Return only the applications owned by the requesting candidate."""

    return deepcopy(_list_candidate_applications_cached(candidate_id))


@lru_cache(maxsize=128)
def _list_candidate_interviews_cached(candidate_id: int) -> list[dict[str, Any]]:
    """Cached scheduled interviews owned by the requesting candidate."""

    def operation(session: Session) -> list[dict[str, Any]]:
        _require_candidate(session, candidate_id)
        return _fetch_all(
            session,
            """
            SELECT
                a.ApplicationID,
                a.CandidateID,
                c.FullName AS CandidateName,
                a.PositionID,
                jp.Title AS PositionTitle,
                jp.EmployerID,
                e.CompanyName,
                a.ApplicationDate,
                a.Status AS ApplicationStatus,
                i.InterviewID,
                i.InterviewDate,
                i.LocationOrLink,
                i.Result AS InterviewResult,
                i.Score AS InterviewScore,
                i.Notes
            FROM Interviews AS i
            INNER JOIN Applications AS a
                ON a.ApplicationID = i.ApplicationID
            INNER JOIN Candidates AS c
                ON c.CandidateID = a.CandidateID
            INNER JOIN JobPositions AS jp
                ON jp.PositionID = a.PositionID
            INNER JOIN Employers AS e
                ON e.EmployerID = jp.EmployerID
            WHERE a.CandidateID = :candidate_id
            ORDER BY i.InterviewDate DESC
            """,
            {"candidate_id": candidate_id},
        )

    return _run_db(operation)


def list_candidate_interviews(candidate_id: int) -> list[dict[str, Any]]:
    """Return only scheduled interviews owned by the requesting candidate."""

    return deepcopy(_list_candidate_interviews_cached(candidate_id))


def update_application_status(
    employer_id: int,
    application_id: int,
    status: str,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Allow employers to review or reject applications before interview scheduling."""

    if status not in {"Pending", "Reviewed", "Rejected"}:
        raise ValidationError("Application status must be Pending, Reviewed, or Rejected.")

    def operation(session: Session) -> dict[str, Any]:
        application = _require_application_for_employer(session, employer_id, application_id)
        application.status = ApplicationStatusEnum(status)
        session.add(application)
        _write_audit_log(
            session,
            actor,
            "UPDATE_APPLICATION_STATUS",
            "Application",
            application_id,
            f"Set application status to {status}.",
        )
        return {
            "ApplicationID": application_id,
            "UpdatedStatus": status,
            "Message": "Application status updated successfully.",
        }

    result = _run_db(operation)
    clear_read_caches()
    return result


def list_notifications(account_id: int) -> list[dict[str, Any]]:
    """Return notifications for the current account when the table exists."""

    def operation(session: Session) -> list[dict[str, Any]]:
        if not _table_exists(session, "Notifications"):
            return []
        return _fetch_all(
            session,
            """
            SELECT NotificationID, AccountID, Title, Message, IsRead, CreatedAt
            FROM Notifications
            WHERE AccountID = :account_id
            ORDER BY CreatedAt DESC
            LIMIT 25
            """,
            {"account_id": account_id},
        )

    return _run_db(operation)


def get_admin_system_metrics() -> dict[str, Any]:
    """Return system-level metrics for the admin dashboard."""

    def operation(session: Session) -> dict[str, Any]:
        metrics = _fetch_one(session, "SELECT * FROM vw_admin_system_metrics")
        if metrics is not None:
            return metrics
        return {
            "TotalUsers": 0,
            "TotalEmployers": 0,
            "TotalCandidates": 0,
            "TotalJobs": 0,
            "TotalApplications": 0,
            "TotalInterviews": 0,
            "PassRate": 0,
        }

    return _run_db(operation)


def list_admin_employers() -> list[dict[str, Any]]:
    """Return all employer profiles for admin review."""

    def operation(session: Session) -> list[dict[str, Any]]:
        return _fetch_all(
            session,
            """
            SELECT
                e.EmployerID,
                e.AccountID,
                a.Email,
                a.AccountStatus,
                e.ApprovalStatus,
                e.CompanyName,
                e.ContactNumber,
                e.Address,
                e.Description
            FROM Employers AS e
            INNER JOIN Accounts AS a ON a.AccountID = e.AccountID
            ORDER BY e.EmployerID DESC
            """,
        )

    return _run_db(operation)


def list_admin_candidates() -> list[dict[str, Any]]:
    """Return all candidate profiles for admin review."""

    def operation(session: Session) -> list[dict[str, Any]]:
        return _fetch_all(
            session,
            """
            SELECT
                c.CandidateID,
                c.AccountID,
                a.Email,
                a.AccountStatus,
                c.FullName,
                c.DateOfBirth,
                c.PhoneNumber,
                c.ResumeURL
            FROM Candidates AS c
            INNER JOIN Accounts AS a ON a.AccountID = c.AccountID
            ORDER BY c.CandidateID DESC
            """,
        )

    return _run_db(operation)


def list_admin_jobs() -> list[dict[str, Any]]:
    """Return all job positions for admin review."""

    def operation(session: Session) -> list[dict[str, Any]]:
        return _fetch_all(
            session,
            """
            SELECT
                jp.PositionID,
                jp.EmployerID,
                e.CompanyName,
                jp.Title,
                jp.JobDescription,
                jp.Requirements,
                jp.Status,
                jp.PostedDate
            FROM JobPositions AS jp
            INNER JOIN Employers AS e ON e.EmployerID = jp.EmployerID
            ORDER BY jp.PostedDate DESC
            """,
        )

    return _run_db(operation)


def list_admin_applications() -> list[dict[str, Any]]:
    """Return all applications for admin review."""

    def operation(session: Session) -> list[dict[str, Any]]:
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_candidate_application_tracker
            ORDER BY ApplicationDate DESC
            """,
        )

    return _run_db(operation)


def list_admin_interviews() -> list[dict[str, Any]]:
    """Return all interviews for admin review."""

    def operation(session: Session) -> list[dict[str, Any]]:
        return _fetch_all(
            session,
            """
            SELECT *
            FROM vw_interview_results
            ORDER BY InterviewDate DESC
            """,
        )

    return _run_db(operation)


def set_employer_approval_status(
    employer_id: int,
    approval_status: str,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Approve or reject an employer account."""

    if approval_status not in {"Pending", "Approved", "Rejected"}:
        raise ValidationError("Employer approval status must be Pending, Approved, or Rejected.")

    def operation(session: Session) -> dict[str, Any]:
        _require_employer(session, employer_id)
        if not _column_exists(session, "Employers", "ApprovalStatus"):
            raise ValidationError("Admin migration has not been imported.")
        session.execute(
            text("UPDATE Employers SET ApprovalStatus = :status WHERE EmployerID = :employer_id"),
            {"status": approval_status, "employer_id": employer_id},
        )
        _write_audit_log(
            session,
            actor,
            "SET_EMPLOYER_APPROVAL",
            "Employer",
            employer_id,
            f"Set approval status to {approval_status}.",
        )
        return {
            "EmployerID": employer_id,
            "ApprovalStatus": approval_status,
            "Message": "Employer approval updated successfully.",
        }

    result = _run_db(operation)
    clear_read_caches()
    return result


def set_account_status(
    account_id: int,
    account_status: str,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Enable or disable one account."""

    if account_status not in {"Active", "Disabled"}:
        raise ValidationError("Account status must be Active or Disabled.")

    def operation(session: Session) -> dict[str, Any]:
        account = session.get(Account, account_id)
        if account is None:
            raise NotFoundError("Account not found.")
        if not _column_exists(session, "Accounts", "AccountStatus"):
            raise ValidationError("Admin migration has not been imported.")
        session.execute(
            text("UPDATE Accounts SET AccountStatus = :status WHERE AccountID = :account_id"),
            {"status": account_status, "account_id": account_id},
        )
        _write_audit_log(
            session,
            actor,
            "SET_ACCOUNT_STATUS",
            "Account",
            account_id,
            f"Set account status to {account_status}.",
        )
        return {
            "AccountID": account_id,
            "AccountStatus": account_status,
            "Message": "Account status updated successfully.",
        }

    result = _run_db(operation)
    clear_read_caches()
    return result


def admin_reset_password(
    account_id: int,
    new_password: str,
    confirm_password: str,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Reset an account password from the admin workspace."""

    next_password = _validate_new_password(new_password, confirm_password)

    def operation(session: Session) -> dict[str, Any]:
        account = session.get(Account, account_id)
        if account is None:
            raise NotFoundError("Account not found.")
        account.password_hash = _hash_password(next_password)
        session.add(account)
        _write_audit_log(
            session,
            actor,
            "RESET_PASSWORD",
            "Account",
            account_id,
            "Admin reset account password.",
        )
        return {
            "AccountID": account_id,
            "Message": "Password reset successfully.",
        }

    return _run_db(operation)


def list_audit_logs() -> list[dict[str, Any]]:
    """Return recent audit logs."""

    def operation(session: Session) -> list[dict[str, Any]]:
        if not _table_exists(session, "AuditLogs"):
            return []
        return _fetch_all(
            session,
            """
            SELECT *
            FROM AuditLogs
            ORDER BY CreatedAt DESC
            LIMIT 100
            """,
        )

    return _run_db(operation)


def get_data_quality_report() -> dict[str, Any]:
    """Return data quality signals for admin cleanup."""

    def operation(session: Session) -> dict[str, Any]:
        duplicate_candidates = _fetch_all(
            session,
            """
            SELECT FullName, PhoneNumber, COUNT(*) AS DuplicateCount
            FROM Candidates
            WHERE PhoneNumber IS NOT NULL
            GROUP BY FullName, PhoneNumber
            HAVING COUNT(*) > 1
            ORDER BY DuplicateCount DESC
            """,
        )
        suspicious_jobs = _fetch_all(
            session,
            """
            SELECT PositionID, EmployerID, Title, Status, PostedDate
            FROM JobPositions
            WHERE LENGTH(JobDescription) < 25
               OR Title LIKE '%test%'
               OR Title LIKE '%spam%'
            ORDER BY PostedDate DESC
            """,
        )
        invalid_employers = _fetch_all(
            session,
            """
            SELECT EmployerID, CompanyName, ContactNumber, Address
            FROM Employers
            WHERE CompanyName IS NULL
               OR TRIM(CompanyName) = ''
               OR ContactNumber IS NULL
               OR TRIM(ContactNumber) = ''
            ORDER BY EmployerID DESC
            """,
        )
        return {
            "duplicate_candidates": duplicate_candidates,
            "suspicious_jobs": suspicious_jobs,
            "invalid_employers": invalid_employers,
        }

    return _run_db(operation)


def create_job_position(
    employer_id: int,
    title: str,
    job_description: str,
    requirements: str | None,
    status: str = "Open",
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Create a job position through the database routine after validating input."""

    title_value = title.strip()
    description_value = job_description.strip()
    if not title_value:
        raise ValidationError("Job title is required.")
    if not description_value:
        raise ValidationError("Job description is required.")
    if status not in {"Open", "Closed"}:
        raise ValidationError("Job status must be Open or Closed.")

    def operation(session: Session) -> dict[str, Any]:
        _require_employer(session, employer_id)
        return _call_procedure(
            session,
            "sp_create_job_position",
            (
                employer_id,
                title_value,
                description_value,
                (requirements or "").strip(),
                status,
            ),
        )

    result = _run_db(operation)
    log_audit(actor, "CREATE_JOB", "JobPosition", result.get("PositionID"), f"Created job '{title_value}'.")
    clear_read_caches()
    return result


def update_job_status(
    employer_id: int,
    position_id: int,
    status: str,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Update a job status only when the position belongs to the employer."""

    if status not in {"Open", "Closed"}:
        raise ValidationError("Job status must be Open or Closed.")

    def operation(session: Session) -> dict[str, Any]:
        _require_position_for_employer(session, employer_id, position_id)
        return _call_procedure(
            session,
            "sp_update_job_status",
            (position_id, status),
        )

    result = _run_db(operation)
    log_audit(actor, "UPDATE_JOB_STATUS", "JobPosition", position_id, f"Set status to {status}.")
    clear_read_caches()
    return result


def submit_application(
    candidate_id: int,
    position_id: int,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Submit an application through the database routine."""

    def operation(session: Session) -> dict[str, Any]:
        return _call_procedure(
            session,
            "sp_submit_application",
            (candidate_id, position_id),
        )

    result = _run_db(operation)
    log_audit(actor, "SUBMIT_APPLICATION", "Application", result.get("ApplicationID"), f"Applied to position {position_id}.")
    clear_read_caches()
    return result


def clear_read_caches() -> None:
    """Clear cached read models so navigation stays fast but writes remain fresh."""

    _get_employer_profile_cached.cache_clear()
    _get_candidate_profile_cached.cache_clear()
    _list_candidate_profiles_cached.cache_clear()
    _get_employer_dashboard_metrics_cached.cache_clear()
    _list_employer_monthly_pass_rate_cached.cache_clear()
    _list_employer_job_application_summary_cached.cache_clear()
    _list_employer_job_positions_cached.cache_clear()
    _list_employer_applications_cached.cache_clear()
    _list_employer_pending_interview_candidates_cached.cache_clear()
    _list_shortlisted_candidates_cached.cache_clear()
    _list_employer_interview_results_cached.cache_clear()
    _list_open_job_positions_cached.cache_clear()
    _list_candidate_applications_cached.cache_clear()
    _list_candidate_interviews_cached.cache_clear()


def update_candidate_profile(
    candidate_id: int,
    full_name: str,
    date_of_birth: date | None,
    phone_number: str | None,
    resume_url: str | None,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Update the requesting candidate's own profile with basic validation."""

    normalized_name = full_name.strip()
    if not normalized_name:
        raise ValidationError("Full name is required.")

    def operation(session: Session) -> dict[str, Any]:
        candidate = _require_candidate(session, candidate_id)
        candidate.full_name = normalized_name
        candidate.date_of_birth = date_of_birth
        candidate.phone_number = (phone_number or "").strip() or None
        candidate.resume_url = (resume_url or "").strip() or None
        session.add(candidate)
        return {
            "CandidateID": candidate.candidate_id,
            "AccountID": candidate.account_id,
            "FullName": candidate.full_name,
            "DateOfBirth": _serialize_value(candidate.date_of_birth),
            "PhoneNumber": candidate.phone_number,
            "ResumeURL": candidate.resume_url,
        }

    result = _run_db(operation)
    log_audit(actor, "UPDATE_CANDIDATE_PROFILE", "Candidate", candidate_id, "Updated candidate profile.")
    clear_read_caches()
    return result


def schedule_interview(
    employer_id: int,
    application_id: int,
    interview_date: datetime,
    location_or_link: str | None,
    notes: str | None,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Schedule an interview through the database routine after ownership checks."""

    def operation(session: Session) -> dict[str, Any]:
        application = _require_application_for_employer(session, employer_id, application_id)
        if interview_date is None:
            raise ValidationError("Interview date is required.")
        if interview_date <= application.application_date:
            raise ValidationError("Interview date must be after the application date.")
        payload = _call_procedure(
            session,
            "sp_schedule_interview",
            (
                application_id,
                interview_date,
                (location_or_link or "").strip(),
                (notes or "").strip(),
            ),
        )
        candidate_account = _fetch_one(
            session,
            """
            SELECT c.AccountID
            FROM Applications AS a
            INNER JOIN Candidates AS c ON c.CandidateID = a.CandidateID
            WHERE a.ApplicationID = :application_id
            """,
            {"application_id": application_id},
        )
        _create_notification(
            session,
            None if candidate_account is None else int(candidate_account["AccountID"]),
            "Interview scheduled",
            f"An interview has been scheduled for application #{application_id}.",
        )
        _write_audit_log(
            session,
            actor,
            "SCHEDULE_INTERVIEW",
            "Application",
            application_id,
            f"Scheduled interview at {interview_date.isoformat(sep=' ')}.",
        )
        return payload

    result = _run_db(operation)
    clear_read_caches()
    return result


def record_interview_result(
    employer_id: int,
    application_id: int,
    result: str,
    score: float | None,
    notes: str | None,
    actor: AuthenticatedUser | None = None,
) -> dict[str, Any]:
    """Record an interview outcome through the database routine."""

    if result not in {"Pending", "Pass", "Fail"}:
        raise ValidationError("Interview result must be Pending, Pass, or Fail.")
    if result == "Pending" and score is not None:
        raise ValidationError("Pending interview results must not have a score.")
    if result in {"Pass", "Fail"} and (score is None or score < 0 or score > 10):
        raise ValidationError("Final interview results require a score between 0 and 10.")

    def operation(session: Session) -> dict[str, Any]:
        _require_application_for_employer(session, employer_id, application_id)
        payload = _call_procedure(
            session,
            "sp_record_interview_result",
            (
                application_id,
                result,
                None if result == "Pending" else score,
                (notes or "").strip(),
            ),
        )
        candidate_account = _fetch_one(
            session,
            """
            SELECT c.AccountID
            FROM Applications AS a
            INNER JOIN Candidates AS c ON c.CandidateID = a.CandidateID
            WHERE a.ApplicationID = :application_id
            """,
            {"application_id": application_id},
        )
        _create_notification(
            session,
            None if candidate_account is None else int(candidate_account["AccountID"]),
            "Interview result updated",
            f"Interview result for application #{application_id} is {result}.",
        )
        _write_audit_log(
            session,
            actor,
            "RECORD_INTERVIEW_RESULT",
            "Application",
            application_id,
            f"Recorded result {result} with score {score}.",
        )
        return payload

    result = _run_db(operation)
    clear_read_caches()
    return result

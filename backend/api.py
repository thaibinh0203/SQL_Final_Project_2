"""FastAPI deployment entrypoint for the recruitment backend."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import date, datetime, timedelta
import os
from pathlib import Path
import re
from typing import Any

from fastapi import Depends, FastAPI, File, Header, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend import crud
from backend.config import get_settings
from backend.crud import AuthenticationError, AuthorizationError, BackendError, NotFoundError, ValidationError
from backend.security import CurrentUser, create_access_token, decode_access_token


app = FastAPI(
    title="Recruitment Management System API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


def _cors_origins() -> list[str]:
    origins = os.getenv("FRONTEND_ORIGINS", "*").strip() or "*"
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_ROOT = Path("uploads")
CV_UPLOAD_DIR = UPLOAD_ROOT / "cv"
CV_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

LOGIN_ATTEMPTS: dict[str, deque[datetime]] = defaultdict(deque)
LOGIN_LIMIT = 5
LOGIN_WINDOW = timedelta(minutes=5)


class RateLimitError(BackendError):
    """Raised when login attempts exceed the accepted window."""


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _check_login_rate_limit(request: Request, email: str) -> None:
    key = f"{_client_ip(request)}:{email.strip().lower()}"
    now = datetime.utcnow()
    attempts = LOGIN_ATTEMPTS[key]
    while attempts and now - attempts[0] > LOGIN_WINDOW:
        attempts.popleft()
    if len(attempts) >= LOGIN_LIMIT:
        raise RateLimitError("Too many login attempts. Please try again later.")
    attempts.append(now)


def _clear_login_rate_limit(request: Request, email: str) -> None:
    LOGIN_ATTEMPTS.pop(f"{_client_ip(request)}:{email.strip().lower()}", None)


def _user_response(user: crud.AuthenticatedUser | CurrentUser) -> dict[str, Any]:
    payload = {
        "account_id": user.account_id,
        "email": user.email,
        "role": user.role,
        "employer_id": user.employer_id,
        "candidate_id": user.candidate_id,
        "display_name": user.display_name,
    }
    return payload


def _token_response(user: crud.AuthenticatedUser) -> dict[str, Any]:
    current_user = CurrentUser(**_user_response(user))
    return {
        "access_token": create_access_token(current_user),
        "token_type": "bearer",
        "user": _user_response(user),
    }


def _actor(current_user: CurrentUser) -> crud.AuthenticatedUser:
    return crud.AuthenticatedUser(**_user_response(current_user))


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthenticationError("Missing bearer access token.")
    current_user = decode_access_token(authorization.split(" ", 1)[1].strip())
    crud.validate_token_user(
        account_id=current_user.account_id,
        role=current_user.role,
        employer_id=current_user.employer_id,
    )
    return current_user


def require_role(current_user: CurrentUser, *roles: str) -> None:
    if current_user.role not in roles:
        raise AuthorizationError("This account is not allowed to access this resource.")


def require_employer_access(current_user: CurrentUser, employer_id: int) -> None:
    if current_user.role == "Admin":
        return
    if current_user.role != "Employer" or current_user.employer_id != employer_id:
        raise AuthorizationError("This employer resource is not available for the current account.")


def require_candidate_access(current_user: CurrentUser, candidate_id: int) -> None:
    if current_user.role == "Admin":
        return
    if current_user.role != "Candidate" or current_user.candidate_id != candidate_id:
        raise AuthorizationError("This candidate resource is not available for the current account.")


class LoginRequest(BaseModel):
    """Credential payload for API login."""

    email: str
    password: str


class RegisterCandidateRequest(BaseModel):
    """Candidate registration payload."""

    email: str
    password: str
    confirm_password: str
    full_name: str
    date_of_birth: date | None = None
    phone_number: str | None = None
    resume_url: str | None = None


class RegisterEmployerRequest(BaseModel):
    """Employer registration payload."""

    email: str
    password: str
    confirm_password: str
    company_name: str
    contact_number: str | None = None
    address: str | None = None
    description: str | None = None


class ChangePasswordRequest(BaseModel):
    """Authenticated password-change payload."""

    account_id: int
    current_password: str
    new_password: str
    confirm_password: str


class UpdateCandidateProfileRequest(BaseModel):
    """Candidate profile update payload."""

    full_name: str
    date_of_birth: date | None = None
    phone_number: str | None = None
    resume_url: str | None = None


class CreateJobRequest(BaseModel):
    """Job creation payload."""

    title: str
    job_description: str
    requirements: str | None = None
    status: str = "Open"


class UpdateJobStatusRequest(BaseModel):
    """Job status update payload."""

    status: str


class UpdateApplicationStatusRequest(BaseModel):
    """Application status update payload."""

    status: str


class SubmitApplicationRequest(BaseModel):
    """Candidate application submission payload."""

    position_id: int


class ScheduleInterviewRequest(BaseModel):
    """Interview scheduling payload."""

    application_id: int
    interview_date: datetime
    location_or_link: str | None = None
    notes: str | None = None


class RecordInterviewResultRequest(BaseModel):
    """Interview result payload."""

    application_id: int
    result: str
    score: float | None = None
    notes: str | None = None


class AdminApprovalRequest(BaseModel):
    """Employer approval update payload."""

    approval_status: str


class AdminAccountStatusRequest(BaseModel):
    """Account status update payload."""

    account_status: str


class AdminResetPasswordRequest(BaseModel):
    """Admin password reset payload."""

    new_password: str
    confirm_password: str


@app.exception_handler(BackendError)
async def handle_backend_error(_: Any, exc: BackendError) -> JSONResponse:
    """Return safe backend errors as JSON responses."""

    if isinstance(exc, RateLimitError):
        status_code = 429
    elif isinstance(exc, AuthenticationError):
        status_code = 401
    elif isinstance(exc, AuthorizationError):
        status_code = 403
    elif isinstance(exc, NotFoundError):
        status_code = 404
    elif isinstance(exc, ValidationError):
        status_code = 400
    else:
        status_code = 500
    return JSONResponse(status_code=status_code, content={"detail": str(exc)})


@app.get("/")
def root() -> dict[str, str]:
    """Simple root response for Render."""

    return {
        "service": "recruitment-management-system-api",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    """Health endpoint with resolved runtime config."""

    settings = get_settings()
    return {
        "status": "ok",
        "database_host": settings.db_host,
        "database_name": settings.db_name,
    }


@app.get("/smoke-test")
def smoke_test() -> dict[str, Any]:
    """Minimal read-path verification for deployed environments."""

    jobs = crud.list_open_job_positions()
    return {
        "status": "ok",
        "open_jobs": len(jobs),
    }


@app.post("/auth/login")
def login(request: Request, payload: LoginRequest) -> dict[str, Any]:
    """Authenticate one employer or candidate account."""

    _check_login_rate_limit(request, payload.email)
    user = crud.authenticate_user(payload.email, payload.password)
    _clear_login_rate_limit(request, payload.email)
    return _token_response(user)


@app.post("/auth/register-candidate")
def register_candidate(payload: RegisterCandidateRequest) -> dict[str, Any]:
    """Register and authenticate one candidate account."""

    user = crud.register_candidate_account(
        email=payload.email,
        password=payload.password,
        confirm_password=payload.confirm_password,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        phone_number=payload.phone_number,
        resume_url=payload.resume_url,
    )
    return _token_response(user)


@app.post("/auth/register-employer")
def register_employer(payload: RegisterEmployerRequest) -> dict[str, Any]:
    """Register and authenticate one employer account."""

    user = crud.register_employer_account(
        email=payload.email,
        password=payload.password,
        confirm_password=payload.confirm_password,
        company_name=payload.company_name,
        contact_number=payload.contact_number,
        address=payload.address,
        description=payload.description,
    )
    return _token_response(user)


@app.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Change an authenticated account password."""

    if payload.account_id != current_user.account_id:
        raise AuthorizationError("Password can only be changed for the current account.")
    return crud.change_account_password(
        account_id=current_user.account_id,
        current_password=payload.current_password,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
    )


@app.get("/auth/me")
def me(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return the current token identity."""

    return _user_response(current_user)


@app.get("/jobs/open")
def open_jobs(search: str | None = None) -> dict[str, Any]:
    """Return globally visible open job positions."""

    rows = crud.list_open_job_positions(search_term=search)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/profile")
def employer_profile(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return one employer profile."""

    require_employer_access(current_user, employer_id)
    return crud.get_employer_profile(employer_id)


@app.get("/employers/{employer_id}/dashboard-metrics")
def employer_dashboard_metrics(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return dashboard metrics for one employer."""

    require_employer_access(current_user, employer_id)
    return crud.get_employer_dashboard_metrics(employer_id)


@app.get("/employers/{employer_id}/pass-rate-years")
def employer_pass_rate_years(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return years available for monthly pass-rate trend filtering."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_pass_rate_years(employer_id)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/pass-rate-trend")
def employer_pass_rate_trend(
    employer_id: int,
    year: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return 12 monthly pass-rate rows for one employer and year."""

    require_employer_access(current_user, employer_id)
    selected_year = year or date.today().year
    rows = crud.list_employer_monthly_pass_rate(employer_id, selected_year)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/jobs")
def employer_jobs(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return employer-owned job positions."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_job_positions(employer_id)
    return {"count": len(rows), "items": rows}


@app.post("/employers/{employer_id}/jobs")
def create_employer_job(
    employer_id: int,
    payload: CreateJobRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Create one employer-owned job position."""

    require_employer_access(current_user, employer_id)
    require_role(current_user, "Employer", "Admin")
    return crud.create_job_position(
        employer_id=employer_id,
        title=payload.title,
        job_description=payload.job_description,
        requirements=payload.requirements,
        status=payload.status,
        actor=_actor(current_user),
    )


@app.patch("/employers/{employer_id}/jobs/{position_id}/status")
def update_employer_job_status(
    employer_id: int,
    position_id: int,
    payload: UpdateJobStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Update an employer-owned job status."""

    require_employer_access(current_user, employer_id)
    require_role(current_user, "Employer", "Admin")
    return crud.update_job_status(
        employer_id=employer_id,
        position_id=position_id,
        status=payload.status,
        actor=_actor(current_user),
    )


@app.get("/employers/{employer_id}/job-application-summary")
def employer_job_application_summary(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return per-position application metrics for one employer."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_job_application_summary(employer_id)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/applications")
def employer_applications(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return employer-owned applications."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_applications(employer_id)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/pending-interviews")
def employer_pending_interviews(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return applications ready for interview scheduling."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_pending_interview_candidates(employer_id)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/shortlisted-candidates")
def employer_shortlisted_candidates(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return shortlisted candidates for one employer."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_shortlisted_candidates(employer_id)
    return {"count": len(rows), "items": rows}


@app.get("/employers/{employer_id}/candidate-profiles")
def employer_candidate_profiles(
    employer_id: int,
    candidate_ids: list[int] | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return candidate profiles keyed by candidate ID for employer review panels."""

    require_employer_access(current_user, employer_id)
    crud.get_employer_profile(employer_id)
    profiles = crud.list_candidate_profiles(candidate_ids or [])
    return {"count": len(profiles), "items": profiles}


@app.get("/employers/{employer_id}/interviews")
def employer_interviews(
    employer_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return employer-owned interview results."""

    require_employer_access(current_user, employer_id)
    rows = crud.list_employer_interview_results(employer_id)
    return {"count": len(rows), "items": rows}


@app.post("/employers/{employer_id}/interviews/schedule")
def schedule_employer_interview(
    employer_id: int,
    payload: ScheduleInterviewRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Schedule an interview for an employer-owned application."""

    require_employer_access(current_user, employer_id)
    require_role(current_user, "Employer", "Admin")
    return crud.schedule_interview(
        employer_id=employer_id,
        application_id=payload.application_id,
        interview_date=payload.interview_date,
        location_or_link=payload.location_or_link,
        notes=payload.notes,
        actor=_actor(current_user),
    )


@app.post("/employers/{employer_id}/interviews/result")
def record_employer_interview_result(
    employer_id: int,
    payload: RecordInterviewResultRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Record an interview result for an employer-owned application."""

    require_employer_access(current_user, employer_id)
    require_role(current_user, "Employer", "Admin")
    return crud.record_interview_result(
        employer_id=employer_id,
        application_id=payload.application_id,
        result=payload.result,
        score=payload.score,
        notes=payload.notes,
        actor=_actor(current_user),
    )


@app.patch("/employers/{employer_id}/applications/{application_id}/status")
def update_employer_application_status(
    employer_id: int,
    application_id: int,
    payload: UpdateApplicationStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Update an employer-owned application status before interview scheduling."""

    require_employer_access(current_user, employer_id)
    require_role(current_user, "Employer", "Admin")
    return crud.update_application_status(
        employer_id=employer_id,
        application_id=application_id,
        status=payload.status,
        actor=_actor(current_user),
    )


@app.get("/candidates/{candidate_id}/profile")
def candidate_profile(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return one candidate profile."""

    require_candidate_access(current_user, candidate_id)
    return crud.get_candidate_profile(candidate_id)


@app.put("/candidates/{candidate_id}/profile")
def update_candidate_profile(
    candidate_id: int,
    payload: UpdateCandidateProfileRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Update one candidate profile."""

    require_candidate_access(current_user, candidate_id)
    require_role(current_user, "Candidate", "Admin")
    return crud.update_candidate_profile(
        candidate_id=candidate_id,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        phone_number=payload.phone_number,
        resume_url=payload.resume_url,
        actor=_actor(current_user),
    )


@app.get("/candidates/{candidate_id}/applications")
def candidate_applications(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return one candidate's applications."""

    require_candidate_access(current_user, candidate_id)
    rows = crud.list_candidate_applications(candidate_id)
    return {"count": len(rows), "items": rows}


@app.post("/candidates/{candidate_id}/applications")
def submit_candidate_application(
    candidate_id: int,
    payload: SubmitApplicationRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Submit one candidate application to an open job."""

    require_candidate_access(current_user, candidate_id)
    require_role(current_user, "Candidate", "Admin")
    return crud.submit_application(
        candidate_id=candidate_id,
        position_id=payload.position_id,
        actor=_actor(current_user),
    )


@app.get("/candidates/{candidate_id}/interviews")
def candidate_interviews(
    candidate_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Return one candidate's interviews."""

    require_candidate_access(current_user, candidate_id)
    rows = crud.list_candidate_interviews(candidate_id)
    return {"count": len(rows), "items": rows}


@app.post("/candidates/{candidate_id}/resume-upload")
async def upload_candidate_resume(
    candidate_id: int,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload a candidate CV file and update the profile resume URL."""

    require_candidate_access(current_user, candidate_id)
    require_role(current_user, "Candidate", "Admin")
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file.filename or "resume")
    filename = f"candidate_{candidate_id}_{int(datetime.utcnow().timestamp())}_{safe_name}"
    destination = CV_UPLOAD_DIR / filename
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise ValidationError("Resume file must be 5MB or smaller.")
    destination.write_bytes(content)
    profile = crud.get_candidate_profile(candidate_id)
    resume_url = f"/uploads/cv/{filename}"
    crud.update_candidate_profile(
        candidate_id=candidate_id,
        full_name=str(profile["FullName"]),
        date_of_birth=None if not profile.get("DateOfBirth") else date.fromisoformat(str(profile["DateOfBirth"])),
        phone_number=None if not profile.get("PhoneNumber") else str(profile["PhoneNumber"]),
        resume_url=resume_url,
        actor=_actor(current_user),
    )
    return {"ResumeURL": resume_url, "Message": "Resume uploaded successfully."}


@app.get("/accounts/me/notifications")
def current_account_notifications(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return current account notifications."""

    rows = crud.list_notifications(current_user.account_id)
    return {"count": len(rows), "items": rows}


@app.get("/admin/dashboard-metrics")
def admin_dashboard_metrics(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return admin system metrics."""

    require_role(current_user, "Admin")
    return crud.get_admin_system_metrics()


@app.get("/admin/employers")
def admin_employers(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return all employers for admin review."""

    require_role(current_user, "Admin")
    rows = crud.list_admin_employers()
    return {"count": len(rows), "items": rows}


@app.get("/admin/candidates")
def admin_candidates(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return all candidates for admin review."""

    require_role(current_user, "Admin")
    rows = crud.list_admin_candidates()
    return {"count": len(rows), "items": rows}


@app.get("/admin/jobs")
def admin_jobs(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return all jobs for admin review."""

    require_role(current_user, "Admin")
    rows = crud.list_admin_jobs()
    return {"count": len(rows), "items": rows}


@app.get("/admin/applications")
def admin_applications(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return all applications for admin review."""

    require_role(current_user, "Admin")
    rows = crud.list_admin_applications()
    return {"count": len(rows), "items": rows}


@app.get("/admin/interviews")
def admin_interviews(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return all interviews for admin review."""

    require_role(current_user, "Admin")
    rows = crud.list_admin_interviews()
    return {"count": len(rows), "items": rows}


@app.patch("/admin/employers/{employer_id}/approval")
def admin_set_employer_approval(
    employer_id: int,
    payload: AdminApprovalRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Approve, reject, or move an employer back to pending."""

    require_role(current_user, "Admin")
    return crud.set_employer_approval_status(
        employer_id=employer_id,
        approval_status=payload.approval_status,
        actor=_actor(current_user),
    )


@app.patch("/admin/accounts/{account_id}/status")
def admin_set_account_status(
    account_id: int,
    payload: AdminAccountStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Enable or disable one account."""

    require_role(current_user, "Admin")
    return crud.set_account_status(
        account_id=account_id,
        account_status=payload.account_status,
        actor=_actor(current_user),
    )


@app.post("/admin/accounts/{account_id}/reset-password")
def admin_reset_password(
    account_id: int,
    payload: AdminResetPasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Reset one account password."""

    require_role(current_user, "Admin")
    return crud.admin_reset_password(
        account_id=account_id,
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        actor=_actor(current_user),
    )


@app.get("/admin/audit-logs")
def admin_audit_logs(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return recent audit logs."""

    require_role(current_user, "Admin")
    rows = crud.list_audit_logs()
    return {"count": len(rows), "items": rows}


@app.get("/admin/data-quality")
def admin_data_quality(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Return suspicious data quality signals."""

    require_role(current_user, "Admin")
    return crud.get_data_quality_report()

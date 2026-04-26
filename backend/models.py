"""SQLAlchemy 2.0 models for the recruitment management database."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SqlEnum, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


def _enum_values(enum_class: type[Enum]) -> list[str]:
    """Return enum values so SQLAlchemy stores readable database values."""

    return [member.value for member in enum_class]


class RoleEnum(str, Enum):
    """Defines supported account roles for application login and authorization."""

    EMPLOYER = "Employer"
    CANDIDATE = "Candidate"
    ADMIN = "Admin"


class JobStatusEnum(str, Enum):
    """Defines whether a job position is available to candidates."""

    OPEN = "Open"
    CLOSED = "Closed"


class ApplicationStatusEnum(str, Enum):
    """Defines the hiring pipeline state for each application."""

    PENDING = "Pending"
    REVIEWED = "Reviewed"
    INTERVIEWING = "Interviewing"
    REJECTED = "Rejected"
    ACCEPTED = "Accepted"


class InterviewResultEnum(str, Enum):
    """Defines the final or pending outcome recorded for an interview."""

    PENDING = "Pending"
    PASS = "Pass"
    FAIL = "Fail"


class Account(Base):
    """Represents a login account that links to exactly one employer or candidate profile."""

    __tablename__ = "Accounts"
    __table_args__ = (Index("idx_accounts_email", "Email"),)

    account_id: Mapped[int] = mapped_column("AccountID", primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column("Email", String(150), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column("PasswordHash", String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(
        "Role",
        SqlEnum(RoleEnum, values_callable=_enum_values, name="role_enum"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column("CreatedAt", DateTime, nullable=False)

    employer_profile: Mapped["Employer | None"] = relationship(
        back_populates="account",
        uselist=False,
    )
    candidate_profile: Mapped["Candidate | None"] = relationship(
        back_populates="account",
        uselist=False,
    )


class Employer(Base):
    """Represents an employer company profile owned by one employer account."""

    __tablename__ = "Employers"

    employer_id: Mapped[int] = mapped_column("EmployerID", primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        "AccountID",
        ForeignKey("Accounts.AccountID", onupdate="CASCADE", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    company_name: Mapped[str] = mapped_column("CompanyName", String(120), nullable=False)
    contact_number: Mapped[str | None] = mapped_column("ContactNumber", String(20), nullable=True)
    address: Mapped[str | None] = mapped_column("Address", Text, nullable=True)
    description: Mapped[str | None] = mapped_column("Description", Text, nullable=True)

    account: Mapped[Account] = relationship(back_populates="employer_profile")
    job_positions: Mapped[list["JobPosition"]] = relationship(back_populates="employer")


class Candidate(Base):
    """Represents a candidate profile owned by one candidate account."""

    __tablename__ = "Candidates"

    candidate_id: Mapped[int] = mapped_column("CandidateID", primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        "AccountID",
        ForeignKey("Accounts.AccountID", onupdate="CASCADE", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column("FullName", String(120), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column("DateOfBirth", Date, nullable=True)
    phone_number: Mapped[str | None] = mapped_column("PhoneNumber", String(20), nullable=True)
    resume_url: Mapped[str | None] = mapped_column("ResumeURL", String(255), nullable=True)

    account: Mapped[Account] = relationship(back_populates="candidate_profile")
    applications: Mapped[list["Application"]] = relationship(back_populates="candidate")


class JobPosition(Base):
    """Represents a job posting created and managed by one employer."""

    __tablename__ = "JobPositions"
    __table_args__ = (Index("idx_jobpositions_status", "Status"),)

    position_id: Mapped[int] = mapped_column("PositionID", primary_key=True, autoincrement=True)
    employer_id: Mapped[int] = mapped_column(
        "EmployerID",
        ForeignKey("Employers.EmployerID", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column("Title", String(120), nullable=False)
    job_description: Mapped[str] = mapped_column("JobDescription", Text, nullable=False)
    requirements: Mapped[str | None] = mapped_column("Requirements", Text, nullable=True)
    status: Mapped[JobStatusEnum] = mapped_column(
        "Status",
        SqlEnum(JobStatusEnum, values_callable=_enum_values, name="job_status_enum"),
        nullable=False,
    )
    posted_date: Mapped[datetime] = mapped_column("PostedDate", DateTime, nullable=False)

    employer: Mapped[Employer] = relationship(back_populates="job_positions")
    applications: Mapped[list["Application"]] = relationship(back_populates="position")


class Application(Base):
    """Represents a candidate applying to one specific job position."""

    __tablename__ = "Applications"
    __table_args__ = (
        UniqueConstraint("CandidateID", "PositionID", name="uq_applications_candidate_position"),
        Index("idx_applications_status", "Status"),
    )

    application_id: Mapped[int] = mapped_column("ApplicationID", primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(
        "CandidateID",
        ForeignKey("Candidates.CandidateID", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
    )
    position_id: Mapped[int] = mapped_column(
        "PositionID",
        ForeignKey("JobPositions.PositionID", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False,
    )
    application_date: Mapped[datetime] = mapped_column("ApplicationDate", DateTime, nullable=False)
    status: Mapped[ApplicationStatusEnum] = mapped_column(
        "Status",
        SqlEnum(
            ApplicationStatusEnum,
            values_callable=_enum_values,
            name="application_status_enum",
        ),
        nullable=False,
    )

    candidate: Mapped[Candidate] = relationship(back_populates="applications")
    position: Mapped[JobPosition] = relationship(back_populates="applications")
    interview: Mapped["Interview | None"] = relationship(
        back_populates="application",
        uselist=False,
    )


class Interview(Base):
    """Represents the interview record linked one-to-one with an application."""

    __tablename__ = "Interviews"
    __table_args__ = (
        UniqueConstraint("ApplicationID", name="uq_interviews_application"),
        Index("idx_interviews_date", "InterviewDate"),
    )

    interview_id: Mapped[int] = mapped_column("InterviewID", primary_key=True, autoincrement=True)
    application_id: Mapped[int] = mapped_column(
        "ApplicationID",
        ForeignKey("Applications.ApplicationID", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
    )
    interview_date: Mapped[datetime] = mapped_column("InterviewDate", DateTime, nullable=False)
    location_or_link: Mapped[str | None] = mapped_column("LocationOrLink", String(255), nullable=True)
    result: Mapped[InterviewResultEnum] = mapped_column(
        "Result",
        SqlEnum(
            InterviewResultEnum,
            values_callable=_enum_values,
            name="interview_result_enum",
        ),
        nullable=False,
    )
    score: Mapped[Decimal | None] = mapped_column("Score", Numeric(5, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column("Notes", Text, nullable=True)

    application: Mapped[Application] = relationship(back_populates="interview")

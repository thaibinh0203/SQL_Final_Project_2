"""Candidate-facing Streamlit pages."""

from __future__ import annotations

from collections import Counter
from datetime import date

import streamlit as st
from streamlit_option_menu import option_menu

from backend import crud
from backend.crud import BackendError
from frontend.components import (
    metric_row,
    page_header,
    panel_header,
    parse_optional_date,
    show_reference_activity_table,
    sidebar_identity_card,
    sidebar_nav_heading,
)
from frontend.session import current_account_id, current_candidate_id


def _status_breakdown(records: list[dict[str, object]]) -> Counter[str]:
    """Summarize application statuses for candidate progress tracking."""

    statuses = [str(row.get("ApplicationStatus") or row.get("Status") or "Unknown") for row in records]
    return Counter(statuses)


def _short_text(value: object, limit: int = 44) -> str:
    """Trim verbose text so candidate activity rows stay readable."""

    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _open_job_activity_rows(records: list[dict[str, object]]) -> list[dict[str, str]]:
    """Map open job postings into the reference activity-table shape."""

    return [
        {
            "title": str(row.get("Title") or "Open Position"),
            "subtitle": (
                f"#{row.get('PositionID')} | "
                f"{_short_text(row.get('Requirements') or row.get('JobDescription') or 'Open job posting')}"
            ),
            "status": str(row.get("Status") or "Open"),
            "branch": str(row.get("CompanyName") or "Company"),
            "time": str(row.get("PostedDate") or "")[:16] or "-",
        }
        for row in records
    ]


def _candidate_application_activity_rows(records: list[dict[str, object]]) -> list[dict[str, str]]:
    """Map candidate applications into the reference activity-table shape."""

    return [
        {
            "title": str(row.get("PositionTitle") or "Application"),
            "subtitle": f"App #{row.get('ApplicationID')} | {row.get('CandidateName') or 'Candidate'}",
            "status": str(row.get("ApplicationStatus") or "Unknown"),
            "branch": str(row.get("CompanyName") or "Company"),
            "time": str(row.get("ApplicationDate") or "")[:16] or "-",
        }
        for row in records
    ]


def _candidate_interview_activity_rows(records: list[dict[str, object]]) -> list[dict[str, object]]:
    """Map candidate interviews into the reference activity-table shape."""

    return [
        {
            "title": str(row.get("PositionTitle") or "Interview"),
            "subtitle": (
                f"App #{row.get('ApplicationID')} | "
                f"{_short_text(row.get('LocationOrLink') or row.get('CompanyName') or 'Interview scheduled')}"
            ),
            "status": str(row.get("InterviewResult") or row.get("ApplicationStatus") or "Pending"),
            "branch": str(row.get("CompanyName") or "Company"),
            "time": str(row.get("InterviewDate") or "")[:16] or "-",
            "details": [f"Notes: {_short_text(row.get('Notes') or 'No notes', 78)}"],
        }
        for row in records
    ]


def _render_account_security() -> None:
    """Render password management controls for the authenticated candidate account."""

    account_id = current_account_id()
    with st.container(border=True):
        panel_header(
            "Account Security",
            "Set your own password or change the current one for future logins.",
            eyebrow="Security",
            badge="Password",
        )
        st.caption("For older seeded accounts, the initial demo password may still be `1`.")
        with st.form("candidate_change_password_form", clear_on_submit=True):
            current_password = st.text_input("Current Password", type="password")
            new_password = st.text_input("New Password", type="password")
            confirm_password = st.text_input("Confirm New Password", type="password")
            submitted = st.form_submit_button("Update Password", use_container_width=True)

        if submitted:
            try:
                crud.change_account_password(
                    account_id=account_id,
                    current_password=current_password,
                    new_password=new_password,
                    confirm_password=confirm_password,
                )
            except BackendError as exc:
                st.error(str(exc))
            else:
                st.success("Password updated successfully.")


def render_job_board() -> None:
    """Render the global job board and one-click apply flow for one candidate."""

    candidate_id = current_candidate_id()
    current_applications = crud.list_candidate_applications(candidate_id)
    open_jobs = crud.list_open_job_positions()

    page_header(
        "Job Board",
        "Browse all currently open positions across employers and apply directly from your saved profile.",
        eyebrow="Candidate Workspace",
    )

    metric_row(
        [
            ("Open Jobs", len(open_jobs)),
            ("My Applications", len(current_applications)),
            ("Scheduled Interviews", len([row for row in current_applications if row.get("InterviewDate")])),
        ]
    )

    board_col, apply_col = st.columns([1.35, 0.95], gap="large")
    with board_col:
        with st.container(border=True):
            panel_header(
                "Open Positions",
                "Search across currently active job postings.",
                eyebrow="Discovery",
                badge=f"{len(open_jobs)} live",
            )
            search_term = st.text_input("Search Jobs", placeholder="Search by title, company, or keyword")
            positions = crud.list_open_job_positions(search_term=search_term)
            show_reference_activity_table(
                _open_job_activity_rows(positions),
                "No open jobs matched the current search.",
                headers=["Position", "Status", "Company", "Posted"],
            )

    with apply_col:
        with st.container(border=True):
            panel_header(
                "Apply To Position",
                "Choose one open posting and submit your application from this workspace.",
                eyebrow="Action",
            )
            if positions:
                options = {
                    row["PositionID"]: f"#{row['PositionID']} - {row['Title']} at {row['CompanyName']}"
                    for row in positions
                }
                with st.form("submit_application_form", clear_on_submit=True):
                    position_id = st.selectbox(
                        "Select Job Position",
                        options=list(options.keys()),
                        format_func=lambda selected_id: options[selected_id],
                    )
                    submitted = st.form_submit_button("Apply Now", use_container_width=True)

                if submitted:
                    try:
                        crud.submit_application(candidate_id=candidate_id, position_id=int(position_id))
                    except BackendError as exc:
                        st.error(str(exc))
                    else:
                        st.success("Application submitted successfully.")
                        st.rerun()
            else:
                st.info("No open positions are available for application right now.")


def render_applications() -> None:
    """Render the current candidate's application tracker."""

    candidate_id = current_candidate_id()
    applications = crud.list_candidate_applications(candidate_id)
    breakdown = _status_breakdown(applications)

    page_header(
        "My Applications",
        "Track every application you have submitted and monitor how each one is progressing.",
        eyebrow="Candidate Workspace",
    )

    metric_row(
        [
            ("Total", len(applications)),
            ("Pending", breakdown.get("Pending", 0)),
            ("Interviewing", breakdown.get("Interviewing", 0)),
            ("Accepted", breakdown.get("Accepted", 0)),
        ]
    )
    with st.container(border=True):
        panel_header(
            "Application Tracker",
            "Review current statuses for every submitted application.",
            eyebrow="Pipeline",
            badge=f"{len(applications)} items",
        )
        show_reference_activity_table(
            _candidate_application_activity_rows(applications),
            "This candidate has not applied for any jobs yet.",
            headers=["Application", "Status", "Company", "Applied"],
        )


def render_interviews() -> None:
    """Render interview history split into upcoming and full history views."""

    candidate_id = current_candidate_id()
    interviews = crud.list_candidate_interviews(candidate_id)

    page_header(
        "My Interviews",
        "Review your interview schedule, outcomes, and meeting details from one place.",
        eyebrow="Candidate Workspace",
    )

    today = date.today().isoformat()
    upcoming = [row for row in interviews if str(row.get("InterviewDate", ""))[:10] >= today]
    history_tab, upcoming_tab = st.tabs(["All Interviews", "Upcoming"])
    with history_tab:
        with st.container(border=True):
            panel_header("Interview History", "All scheduled and completed interviews.", eyebrow="Schedule")
            show_reference_activity_table(
                _candidate_interview_activity_rows(interviews),
                "There are no scheduled interviews for this candidate.",
                headers=["Interview", "Result", "Company", "Date"],
            )
    with upcoming_tab:
        with st.container(border=True):
            panel_header("Upcoming Interviews", "Focus on the next interviews that still need preparation.", eyebrow="Upcoming")
            show_reference_activity_table(
                _candidate_interview_activity_rows(upcoming),
                "There are no upcoming interviews right now.",
                headers=["Interview", "Result", "Company", "Date"],
            )


def render_profile() -> None:
    """Render and update the current candidate's own profile."""

    candidate_id = current_candidate_id()
    profile = crud.get_candidate_profile(candidate_id)
    stored_birth_date = parse_optional_date(profile["DateOfBirth"])

    page_header(
        "My Profile",
        "Keep your candidate profile current so applications and interview workflows stay consistent.",
        eyebrow="Candidate Workspace",
    )

    summary_col, form_col = st.columns([0.9, 1.3])
    with summary_col:
        with st.container(border=True):
            panel_header("Current Details", "Your current profile values inside the system.", eyebrow="Profile")
            st.write(f"**Full Name:** {profile['FullName']}")
            st.write(f"**Phone Number:** {profile['PhoneNumber'] or 'Not set'}")
            st.write(f"**Resume URL:** {profile['ResumeURL'] or 'Not set'}")
            st.write(f"**Date of Birth:** {profile['DateOfBirth'] or 'Not set'}")

    with form_col:
        with st.container(border=True):
            panel_header("Update Profile", "Edit the profile fields used by job applications and interview workflows.", eyebrow="Edit")
            with st.form("update_candidate_profile_form"):
                full_name = st.text_input("Full Name", value=profile["FullName"])
                use_birth_date = st.checkbox("Store Date of Birth", value=stored_birth_date is not None)
                date_of_birth = st.date_input(
                    "Date of Birth",
                    value=stored_birth_date or date.today(),
                    disabled=not use_birth_date,
                )
                phone_number = st.text_input("Phone Number", value=profile["PhoneNumber"] or "")
                resume_url = st.text_input("Resume URL", value=profile["ResumeURL"] or "")
                submitted = st.form_submit_button("Update Profile", use_container_width=True)

            if submitted:
                try:
                    crud.update_candidate_profile(
                        candidate_id=candidate_id,
                        full_name=full_name,
                        date_of_birth=date_of_birth if use_birth_date else None,
                        phone_number=phone_number,
                        resume_url=resume_url,
                    )
                except BackendError as exc:
                    st.error(str(exc))
                else:
                    st.success("Profile updated successfully.")
                    st.rerun()

        _render_account_security()


def render_workspace() -> None:
    """Route the candidate session to one of the candidate-facing pages."""

    options = ["Job Board", "My Applications", "My Interviews", "My Profile"]
    if "candidate_nav_page" not in st.session_state:
        st.session_state["candidate_nav_page"] = "Job Board"

    sidebar_col, main_col = st.columns([0.95, 4.15], gap="large")
    with sidebar_col:
        sidebar_identity_card(
            st.session_state["display_name"],
            st.session_state["role"],
            st.session_state["email"],
        )
        with st.container(border=True):
            sidebar_nav_heading("Candidate Navigation", "Track jobs, applications, interviews, and profile details.")
            page = option_menu(
                menu_title=None,
                options=options,
                icons=["briefcase", "file-earmark-text", "camera-video", "person"],
                default_index=options.index(st.session_state["candidate_nav_page"]),
                key="candidate_option_menu",
                styles={
                    "container": {
                        "padding": "0",
                        "background-color": "transparent",
                    },
                    "icon": {
                        "color": "#6b7280",
                        "font-size": "1rem",
                    },
                    "nav-link": {
                        "font-size": "0.95rem",
                        "font-weight": "500",
                        "color": "#4b5563",
                        "padding": "0.72rem 0.9rem",
                        "border-radius": "12px",
                        "margin": "0 0 0.28rem 0",
                        "--hover-color": "#f8fafc",
                    },
                    "nav-link-selected": {
                        "background-color": "#f3f4f6",
                        "color": "#111827",
                        "font-weight": "600",
                    },
                },
            )
            if page != st.session_state["candidate_nav_page"]:
                st.session_state["candidate_nav_page"] = page

    with main_col:
        if page == "Job Board":
            render_job_board()
        elif page == "My Applications":
            render_applications()
        elif page == "My Interviews":
            render_interviews()
        else:
            render_profile()

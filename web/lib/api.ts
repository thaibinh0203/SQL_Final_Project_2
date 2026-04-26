import type { AnyRecord, ApiKeyedList, ApiList, ApiMessage, AuthSession } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
let accessToken: string | null = null;

type RequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const requestBody: BodyInit | undefined =
    options.body === undefined ? undefined : isFormData ? (options.body as BodyInit) : JSON.stringify(options.body);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {})
    },
    body: requestBody
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail || detail;
    } catch {
      // Keep the generic status message when the backend sends a non-JSON error.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const api = {
  baseUrl: API_BASE_URL,
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  login(payload: { email: string; password: string }) {
    return request<AuthSession>("/auth/login", { method: "POST", body: payload });
  },
  registerCandidate(payload: {
    email: string;
    password: string;
    confirm_password: string;
    full_name: string;
    date_of_birth?: string | null;
    phone_number?: string | null;
    resume_url?: string | null;
  }) {
    return request<AuthSession>("/auth/register-candidate", { method: "POST", body: payload });
  },
  registerEmployer(payload: {
    email: string;
    password: string;
    confirm_password: string;
    company_name: string;
    contact_number?: string | null;
    address?: string | null;
    description?: string | null;
  }) {
    return request<AuthSession>("/auth/register-employer", { method: "POST", body: payload });
  },
  changePassword(payload: {
    account_id: number;
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) {
    return request<ApiMessage>("/auth/change-password", { method: "POST", body: payload });
  },
  openJobs(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<ApiList>(`/jobs/open${query}`);
  },
  employerProfile(employerId: number) {
    return request<AnyRecord>(`/employers/${employerId}/profile`);
  },
  employerMetrics(employerId: number) {
    return request<AnyRecord>(`/employers/${employerId}/dashboard-metrics`);
  },
  employerPassRateYears(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/pass-rate-years`);
  },
  employerPassRateTrend(employerId: number, year: number) {
    return request<ApiList>(`/employers/${employerId}/pass-rate-trend?year=${year}`);
  },
  employerJobs(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/jobs`);
  },
  createEmployerJob(
    employerId: number,
    payload: { title: string; job_description: string; requirements?: string | null; status: string }
  ) {
    return request<ApiMessage>(`/employers/${employerId}/jobs`, { method: "POST", body: payload });
  },
  updateEmployerJobStatus(employerId: number, positionId: number, status: string) {
    return request<ApiMessage>(`/employers/${employerId}/jobs/${positionId}/status`, {
      method: "PATCH",
      body: { status }
    });
  },
  updateEmployerApplicationStatus(employerId: number, applicationId: number, status: string) {
    return request<ApiMessage>(`/employers/${employerId}/applications/${applicationId}/status`, {
      method: "PATCH",
      body: { status }
    });
  },
  employerJobSummary(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/job-application-summary`);
  },
  employerApplications(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/applications`);
  },
  employerPendingInterviews(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/pending-interviews`);
  },
  employerShortlisted(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/shortlisted-candidates`);
  },
  employerInterviews(employerId: number) {
    return request<ApiList>(`/employers/${employerId}/interviews`);
  },
  employerCandidateProfiles(employerId: number, candidateIds: number[]) {
    const params = candidateIds.map((id) => `candidate_ids=${id}`).join("&");
    return request<ApiKeyedList>(`/employers/${employerId}/candidate-profiles?${params}`);
  },
  scheduleInterview(
    employerId: number,
    payload: { application_id: number; interview_date: string; location_or_link?: string; notes?: string }
  ) {
    return request<ApiMessage>(`/employers/${employerId}/interviews/schedule`, { method: "POST", body: payload });
  },
  recordInterviewResult(
    employerId: number,
    payload: { application_id: number; result: string; score?: number | null; notes?: string }
  ) {
    return request<ApiMessage>(`/employers/${employerId}/interviews/result`, { method: "POST", body: payload });
  },
  candidateProfile(candidateId: number) {
    return request<AnyRecord>(`/candidates/${candidateId}/profile`);
  },
  updateCandidateProfile(
    candidateId: number,
    payload: { full_name: string; date_of_birth?: string | null; phone_number?: string | null; resume_url?: string | null }
  ) {
    return request<AnyRecord>(`/candidates/${candidateId}/profile`, { method: "PUT", body: payload });
  },
  uploadCandidateResume(candidateId: number, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<ApiMessage>(`/candidates/${candidateId}/resume-upload`, { method: "POST", body: formData });
  },
  candidateApplications(candidateId: number) {
    return request<ApiList>(`/candidates/${candidateId}/applications`);
  },
  submitApplication(candidateId: number, positionId: number) {
    return request<ApiMessage>(`/candidates/${candidateId}/applications`, {
      method: "POST",
      body: { position_id: positionId }
    });
  },
  candidateInterviews(candidateId: number) {
    return request<ApiList>(`/candidates/${candidateId}/interviews`);
  },
  notifications() {
    return request<ApiList>("/accounts/me/notifications");
  },
  adminMetrics() {
    return request<AnyRecord>("/admin/dashboard-metrics");
  },
  adminEmployers() {
    return request<ApiList>("/admin/employers");
  },
  adminCandidates() {
    return request<ApiList>("/admin/candidates");
  },
  adminJobs() {
    return request<ApiList>("/admin/jobs");
  },
  adminApplications() {
    return request<ApiList>("/admin/applications");
  },
  adminInterviews() {
    return request<ApiList>("/admin/interviews");
  },
  adminSetEmployerApproval(employerId: number, approvalStatus: string) {
    return request<ApiMessage>(`/admin/employers/${employerId}/approval`, {
      method: "PATCH",
      body: { approval_status: approvalStatus }
    });
  },
  adminSetAccountStatus(accountId: number, accountStatus: string) {
    return request<ApiMessage>(`/admin/accounts/${accountId}/status`, {
      method: "PATCH",
      body: { account_status: accountStatus }
    });
  },
  adminResetPassword(accountId: number, newPassword: string, confirmPassword: string) {
    return request<ApiMessage>(`/admin/accounts/${accountId}/reset-password`, {
      method: "POST",
      body: { new_password: newPassword, confirm_password: confirmPassword }
    });
  },
  adminAuditLogs() {
    return request<ApiList>("/admin/audit-logs");
  },
  adminDataQuality() {
    return request<AnyRecord>("/admin/data-quality");
  }
};

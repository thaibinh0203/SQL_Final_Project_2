"use client";

import { useDeferredValue, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Save,
  Search,
  Shield,
  UserRound,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api } from "@/lib/api";
import type { AnyRecord, AuthSession, AuthUser } from "@/lib/types";
import { cn, countBy, formatDate, shortText, toNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/data-table";

type Notice = { type: "success" | "error"; text: string } | null;
type EmployerPage = "Dashboard" | "Jobs" | "Applications" | "Interviews" | "Performance" | "Account";
type CandidatePage = "Job Board" | "Applications" | "Interviews" | "Profile";
type AdminPage = "Dashboard" | "Employers" | "Candidates" | "Jobs" | "Applications" | "Interviews" | "Audit" | "Data Quality";

const chartColors = ["#059669", "#0EA5E9", "#EAB308", "#EF4444", "#64748B"];
const passRateYears = [2026, 2025, 2024, 2023];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const demoPassRatesByYear: Record<number, number[]> = {
  2024: [28, 32, 31, 35, 39, 42, 45, 43, 47, 49, 52, 54],
  2023: [21, 24, 26, 25, 29, 31, 34, 36, 35, 38, 41, 44]
};

function value(row: AnyRecord, key: string) {
  return row[key] ?? "-";
}

function assetUrl(path: unknown) {
  const text = String(path ?? "").trim();
  if (!text) {
    return "";
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  return `${api.baseUrl}${text.startsWith("/") ? text : `/${text}`}`;
}

function metricValue(row: AnyRecord | null, key: string) {
  return toNumber(row?.[key]);
}

function passRateTrendRows(year: number) {
  const demoRates = demoPassRatesByYear[year];
  if (!demoRates) {
    return null;
  }
  return monthLabels.map((month, index) => ({
    Year: year,
    MonthNumber: index + 1,
    MonthLabel: month,
    TotalInterviews: 20 + index,
    PassedInterviews: Math.round(((20 + index) * demoRates[index]) / 100),
    PassRate: demoRates[index]
  }));
}

function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader()
      .then((nextData) => {
        if (active) {
          setData(nextData);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load data.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [...deps, refreshKey]);

  return {
    data,
    loading,
    error,
    reload: () => setRefreshKey((current) => current + 1)
  };
}

function useStoredSession() {
  const [session, setSessionState] = useState<AuthSession | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("recruitment-session");
    if (raw) {
      const storedSession = JSON.parse(raw) as AuthSession;
      api.setAccessToken(storedSession.access_token);
      setSessionState(storedSession);
    }
  }, []);

  function setSession(nextSession: AuthSession | null) {
    setSessionState(nextSession);
    api.setAccessToken(nextSession?.access_token ?? null);
    if (nextSession) {
      window.localStorage.setItem("recruitment-session", JSON.stringify(nextSession));
      window.localStorage.removeItem("recruitment-user");
    } else {
      window.localStorage.removeItem("recruitment-session");
    }
  }

  return [session, setSession] as const;
}

export function RecruitmentApp() {
  const [session, setSession] = useStoredSession();
  const [notice, setNotice] = useState<Notice>(null);
  const user = session?.user ?? null;

  function showNotice(nextNotice: Notice) {
    setNotice(nextNotice);
    if (nextNotice?.type === "success") {
      window.setTimeout(() => setNotice(null), 3500);
    }
  }

  if (!user) {
    return (
      <main className="page-shell">
        <AuthScreen onAuth={setSession} notice={notice} setNotice={showNotice} />
      </main>
    );
  }

  return (
    <main className="page-shell">
      {user.role === "Employer" ? (
        <EmployerWorkspace user={user} onLogout={() => setSession(null)} notice={notice} setNotice={showNotice} />
      ) : user.role === "Admin" ? (
        <AdminWorkspace user={user} onLogout={() => setSession(null)} notice={notice} setNotice={showNotice} />
      ) : (
        <CandidateWorkspace user={user} onLogout={() => setSession(null)} notice={notice} setNotice={showNotice} />
      )}
    </main>
  );
}

function AuthScreen({
  onAuth,
  notice,
  setNotice
}: {
  onAuth: (session: AuthSession) => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const [mode, setMode] = useState<"login" | "candidate" | "employer">("login");
  const [loading, setLoading] = useState(false);
  const [login, setLogin] = useState({ email: "employer0001@example.com", password: "1" });
  const [candidate, setCandidate] = useState({
    email: "",
    full_name: "",
    date_of_birth: "2000-01-01",
    phone_number: "",
    resume_url: "",
    password: "",
    confirm_password: ""
  });
  const [employer, setEmployer] = useState({
    email: "",
    company_name: "",
    contact_number: "",
    address: "",
    description: "",
    password: "",
    confirm_password: ""
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    try {
      if (mode === "employer") {
        await api.registerEmployer(employer);
        setNotice({ type: "success", text: "Employer account created. An admin must approve it before sign in." });
        setMode("login");
        return;
      }
      const nextSession = mode === "login" ? await api.login(login) : await api.registerCandidate(candidate);
      onAuth(nextSession);
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Authentication failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_440px]">
      <section className="flex min-h-[calc(100vh-4rem)] flex-col justify-between rounded-lg border border-line bg-white/70 p-8 shadow-soft backdrop-blur">
        <div>
          <Badge>Recruitment OS</Badge>
          <h1 className="mt-5 max-w-2xl font-heading text-4xl font-extrabold leading-tight text-navy">
            Hiring control room for employers and candidates
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate">
            A production-style frontend for the FastAPI backend on Render, wired to the Railway MySQL workflows.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Feature icon={<BriefcaseBusiness size={18} />} title="Jobs" copy="Publish, close, and inspect positions." />
          <Feature icon={<Users size={18} />} title="Pipeline" copy="Review applicants and shortlist candidates." />
          <Feature icon={<BarChart3 size={18} />} title="Analytics" copy="Track interview outcomes and performance." />
        </div>
      </section>

      <Card className="self-center shadow-soft">
        <CardHeader>
          <div className="flex rounded-lg bg-canvas p-1">
            {[
              ["login", "Sign In"],
              ["candidate", "Candidate"],
              ["employer", "Employer"]
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key as typeof mode)}
                className={cn(
                  "focus-ring flex-1 rounded px-3 py-2 text-sm font-bold transition",
                  mode === key ? "bg-white text-navy shadow-sm" : "text-slate hover:text-navy"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <NoticeBanner notice={notice} />
          <form className="space-y-4" onSubmit={submit}>
            {mode === "login" && (
              <>
                <Field label="Email">
                  <Input value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={login.password}
                    onChange={(event) => setLogin({ ...login, password: event.target.value })}
                  />
                </Field>
              </>
            )}

            {mode === "candidate" && (
              <>
                <Field label="Email">
                  <Input value={candidate.email} onChange={(event) => setCandidate({ ...candidate, email: event.target.value })} />
                </Field>
                <Field label="Full Name">
                  <Input
                    value={candidate.full_name}
                    onChange={(event) => setCandidate({ ...candidate, full_name: event.target.value })}
                  />
                </Field>
                <Field label="Date of Birth">
                  <Input
                    type="date"
                    value={candidate.date_of_birth}
                    onChange={(event) => setCandidate({ ...candidate, date_of_birth: event.target.value })}
                  />
                </Field>
                <Field label="Phone Number">
                  <Input
                    value={candidate.phone_number}
                    onChange={(event) => setCandidate({ ...candidate, phone_number: event.target.value })}
                  />
                </Field>
                <Field label="Resume URL">
                  <Input
                    value={candidate.resume_url}
                    onChange={(event) => setCandidate({ ...candidate, resume_url: event.target.value })}
                  />
                </Field>
                <PasswordPair
                  password={candidate.password}
                  confirm={candidate.confirm_password}
                  onPassword={(password) => setCandidate({ ...candidate, password })}
                  onConfirm={(confirm_password) => setCandidate({ ...candidate, confirm_password })}
                />
              </>
            )}

            {mode === "employer" && (
              <>
                <Field label="Email">
                  <Input value={employer.email} onChange={(event) => setEmployer({ ...employer, email: event.target.value })} />
                </Field>
                <Field label="Company Name">
                  <Input
                    value={employer.company_name}
                    onChange={(event) => setEmployer({ ...employer, company_name: event.target.value })}
                  />
                </Field>
                <Field label="Contact Number">
                  <Input
                    value={employer.contact_number}
                    onChange={(event) => setEmployer({ ...employer, contact_number: event.target.value })}
                  />
                </Field>
                <Field label="Address">
                  <Textarea value={employer.address} onChange={(event) => setEmployer({ ...employer, address: event.target.value })} />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={employer.description}
                    onChange={(event) => setEmployer({ ...employer, description: event.target.value })}
                  />
                </Field>
                <PasswordPair
                  password={employer.password}
                  confirm={employer.confirm_password}
                  onPassword={(password) => setEmployer({ ...employer, password })}
                  onConfirm={(confirm_password) => setEmployer({ ...employer, confirm_password })}
                />
              </>
            )}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Processing..." : mode === "login" ? "Sign In" : "Create Account"}
            </Button>
            <p className="text-center text-xs text-slate">API: {api.baseUrl}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployerWorkspace({
  user,
  onLogout,
  notice,
  setNotice
}: {
  user: AuthUser;
  onLogout: () => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const [page, setPage] = useState<EmployerPage>("Dashboard");
  const employerId = user.employer_id ?? 0;

  return (
    <WorkspaceShell
      title={user.display_name}
      subtitle={user.email}
      role="Employer"
      nav={[
        ["Dashboard", LayoutDashboard],
        ["Jobs", BriefcaseBusiness],
        ["Applications", ClipboardList],
        ["Interviews", CalendarDays],
        ["Performance", BarChart3],
        ["Account", Shield]
      ]}
      active={page}
      onSelect={(next) => setPage(next as EmployerPage)}
      onLogout={onLogout}
      notice={notice}
    >
      {page === "Dashboard" && <EmployerDashboard employerId={employerId} />}
      {page === "Jobs" && <EmployerJobs employerId={employerId} setNotice={setNotice} />}
      {page === "Applications" && <EmployerApplications employerId={employerId} setNotice={setNotice} />}
      {page === "Interviews" && <EmployerInterviews employerId={employerId} setNotice={setNotice} />}
      {page === "Performance" && <EmployerPerformance employerId={employerId} />}
      {page === "Account" && <AccountSecurity user={user} setNotice={setNotice} />}
    </WorkspaceShell>
  );
}

function CandidateWorkspace({
  user,
  onLogout,
  notice,
  setNotice
}: {
  user: AuthUser;
  onLogout: () => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const [page, setPage] = useState<CandidatePage>("Job Board");
  const candidateId = user.candidate_id ?? 0;

  return (
    <WorkspaceShell
      title={user.display_name}
      subtitle={user.email}
      role="Candidate"
      nav={[
        ["Job Board", BriefcaseBusiness],
        ["Applications", FileText],
        ["Interviews", CalendarDays],
        ["Profile", UserRound]
      ]}
      active={page}
      onSelect={(next) => setPage(next as CandidatePage)}
      onLogout={onLogout}
      notice={notice}
    >
      {page === "Job Board" && <CandidateJobBoard candidateId={candidateId} setNotice={setNotice} />}
      {page === "Applications" && <CandidateApplications candidateId={candidateId} />}
      {page === "Interviews" && <CandidateInterviews candidateId={candidateId} />}
      {page === "Profile" && <CandidateProfile user={user} candidateId={candidateId} setNotice={setNotice} />}
    </WorkspaceShell>
  );
}

function AdminWorkspace({
  user,
  onLogout,
  notice,
  setNotice
}: {
  user: AuthUser;
  onLogout: () => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const [page, setPage] = useState<AdminPage>("Dashboard");

  return (
    <WorkspaceShell
      title={user.display_name}
      subtitle={user.email}
      role="Admin"
      nav={[
        ["Dashboard", LayoutDashboard],
        ["Employers", Building2],
        ["Candidates", Users],
        ["Jobs", BriefcaseBusiness],
        ["Applications", ClipboardList],
        ["Interviews", CalendarDays],
        ["Audit", Shield],
        ["Data Quality", Database]
      ]}
      active={page}
      onSelect={(next) => setPage(next as AdminPage)}
      onLogout={onLogout}
      notice={notice}
    >
      {page === "Dashboard" && <AdminDashboard />}
      {page === "Employers" && <AdminEmployers setNotice={setNotice} />}
      {page === "Candidates" && <AdminCandidates setNotice={setNotice} />}
      {page === "Jobs" && <AdminJobs />}
      {page === "Applications" && <AdminApplications />}
      {page === "Interviews" && <AdminInterviews />}
      {page === "Audit" && <AdminAudit />}
      {page === "Data Quality" && <AdminDataQuality />}
    </WorkspaceShell>
  );
}

function AdminDashboard() {
  const metrics = useAsyncData(() => api.adminMetrics(), []);
  const metricRow = metrics.data;
  const chartRows = [
    { name: "Employers", value: metricValue(metricRow, "TotalEmployers") },
    { name: "Candidates", value: metricValue(metricRow, "TotalCandidates") },
    { name: "Jobs", value: metricValue(metricRow, "TotalJobs") },
    { name: "Applications", value: metricValue(metricRow, "TotalApplications") },
    { name: "Interviews", value: metricValue(metricRow, "TotalInterviews") }
  ];

  return (
    <>
      <PageHeader title="System Dashboard" eyebrow="Admin Workspace" copy="Track global users, hiring activity, interview volume, and pass-rate health across the whole system." />
      <ResourceState loading={metrics.loading} error={metrics.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total Users" value={metricValue(metricRow, "TotalUsers")} />
        <Metric label="Employers" value={metricValue(metricRow, "TotalEmployers")} />
        <Metric label="Candidates" value={metricValue(metricRow, "TotalCandidates")} />
        <Metric label="Jobs" value={metricValue(metricRow, "TotalJobs")} />
        <Metric label="Applications" value={metricValue(metricRow, "TotalApplications")} />
        <Metric label="Pass Rate" value={`${metricValue(metricRow, "PassRate").toFixed(1)}%`} />
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="System Volume" icon={<BarChart3 size={18} />} />
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#059669" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}

function AdminEmployers({ setNotice }: { setNotice: (notice: Notice) => void }) {
  const employers = useAsyncData(() => api.adminEmployers(), []);
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState("All");
  const [reset, setReset] = useState({ account_id: "", new_password: "", confirm_password: "" });
  const rows = employers.data?.items ?? [];
  const filtered = rows.filter((row) => {
    const haystack = `${row.CompanyName ?? ""} ${row.Email ?? ""} ${row.ContactNumber ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesApproval = approval === "All" || row.ApprovalStatus === approval;
    return matchesSearch && matchesApproval;
  });

  async function setApprovalStatus(employerId: number, approvalStatus: string) {
    try {
      await api.adminSetEmployerApproval(employerId, approvalStatus);
      employers.reload();
      setNotice({ type: "success", text: "Employer approval updated." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update employer." });
    }
  }

  async function setAccountStatus(accountId: number, accountStatus: string) {
    try {
      await api.adminSetAccountStatus(accountId, accountStatus);
      employers.reload();
      setNotice({ type: "success", text: "Account status updated." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update account." });
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.adminResetPassword(Number(reset.account_id), reset.new_password, reset.confirm_password);
      setReset({ account_id: "", new_password: "", confirm_password: "" });
      setNotice({ type: "success", text: "Password reset successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to reset password." });
    }
  }

  return (
    <>
      <PageHeader title="Employer Administration" eyebrow="Admin Workspace" copy="Approve employers, deactivate suspicious accounts, and reset account access when needed." />
      <ResourceState loading={employers.loading} error={employers.error} />
      <AdminFilters search={search} setSearch={setSearch} status={approval} setStatus={setApproval} options={["All", "Pending", "Approved", "Rejected"]} />
      <Card>
        <CardHeader>
          <SectionTitle title="Employers" icon={<Building2 size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable
            columns={adminEmployerColumns(setApprovalStatus, setAccountStatus)}
            data={filtered}
            emptyText="No employers match the current filters."
          />
        </CardContent>
      </Card>
      <AdminResetPasswordCard
        rows={rows}
        reset={reset}
        setReset={setReset}
        onSubmit={resetPassword}
        labelKey="CompanyName"
      />
    </>
  );
}

function AdminCandidates({ setNotice }: { setNotice: (notice: Notice) => void }) {
  const candidates = useAsyncData(() => api.adminCandidates(), []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [reset, setReset] = useState({ account_id: "", new_password: "", confirm_password: "" });
  const rows = candidates.data?.items ?? [];
  const filtered = rows.filter((row) => {
    const haystack = `${row.FullName ?? ""} ${row.Email ?? ""} ${row.PhoneNumber ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = status === "All" || row.AccountStatus === status;
    return matchesSearch && matchesStatus;
  });

  async function setAccountStatus(accountId: number, accountStatus: string) {
    try {
      await api.adminSetAccountStatus(accountId, accountStatus);
      candidates.reload();
      setNotice({ type: "success", text: "Account status updated." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update account." });
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.adminResetPassword(Number(reset.account_id), reset.new_password, reset.confirm_password);
      setReset({ account_id: "", new_password: "", confirm_password: "" });
      setNotice({ type: "success", text: "Password reset successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to reset password." });
    }
  }

  return (
    <>
      <PageHeader title="Candidate Administration" eyebrow="Admin Workspace" copy="Review candidate profiles, disable invalid accounts, and recover account access." />
      <ResourceState loading={candidates.loading} error={candidates.error} />
      <AdminFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} options={["All", "Active", "Disabled"]} />
      <Card>
        <CardHeader>
          <SectionTitle title="Candidates" icon={<Users size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={adminCandidateColumns(setAccountStatus)} data={filtered} emptyText="No candidates match the current filters." />
        </CardContent>
      </Card>
      <AdminResetPasswordCard
        rows={rows}
        reset={reset}
        setReset={setReset}
        onSubmit={resetPassword}
        labelKey="FullName"
      />
    </>
  );
}

function AdminJobs() {
  const jobs = useAsyncData(() => api.adminJobs(), []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const rows = jobs.data?.items ?? [];
  const filtered = rows.filter((row) => {
    const haystack = `${row.Title ?? ""} ${row.CompanyName ?? ""} ${row.Requirements ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = status === "All" || row.Status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PageHeader title="All Jobs" eyebrow="Admin Workspace" copy="Inspect every job posting across employers and identify spam or low-quality listings." />
      <ResourceState loading={jobs.loading} error={jobs.error} />
      <AdminFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} options={["All", "Open", "Closed"]} />
      <Card>
        <CardContent>
          <DataTable columns={adminJobColumns()} data={filtered} emptyText="No jobs match the current filters." />
        </CardContent>
      </Card>
    </>
  );
}

function AdminApplications() {
  const applications = useAsyncData(() => api.adminApplications(), []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const rows = applications.data?.items ?? [];
  const statuses = ["All", ...Array.from(new Set(rows.map((row) => String(row.ApplicationStatus ?? "Unknown"))))];
  const filtered = rows.filter((row) => {
    const haystack = `${row.CandidateName ?? ""} ${row.CompanyName ?? ""} ${row.PositionTitle ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = status === "All" || row.ApplicationStatus === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PageHeader title="All Applications" eyebrow="Admin Workspace" copy="Search, filter, and audit application flow across the entire recruitment system." />
      <ResourceState loading={applications.loading} error={applications.error} />
      <AdminFilters search={search} setSearch={setSearch} status={status} setStatus={setStatus} options={statuses} />
      <Card>
        <CardContent>
          <DataTable columns={applicationColumns()} data={filtered} emptyText="No applications match the current filters." />
        </CardContent>
      </Card>
    </>
  );
}

function AdminInterviews() {
  const interviews = useAsyncData(() => api.adminInterviews(), []);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("All");
  const rows = interviews.data?.items ?? [];
  const results = ["All", ...Array.from(new Set(rows.map((row) => String(row.Result || row.InterviewResult || "Pending"))))];
  const filtered = rows.filter((row) => {
    const haystack = `${row.CandidateName ?? ""} ${row.CompanyName ?? ""} ${row.PositionTitle ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const currentResult = String(row.Result || row.InterviewResult || "Pending");
    const matchesResult = result === "All" || currentResult === result;
    return matchesSearch && matchesResult;
  });

  return (
    <>
      <PageHeader title="All Interviews" eyebrow="Admin Workspace" copy="Review schedules, recorded outcomes, scores, and interview notes from one system view." />
      <ResourceState loading={interviews.loading} error={interviews.error} />
      <AdminFilters search={search} setSearch={setSearch} status={result} setStatus={setResult} options={results} />
      <Card>
        <CardContent>
          <DataTable columns={interviewColumns()} data={filtered} emptyText="No interviews match the current filters." />
        </CardContent>
      </Card>
    </>
  );
}

function AdminAudit() {
  const audit = useAsyncData(() => api.adminAuditLogs(), []);
  return (
    <>
      <PageHeader title="Audit Log" eyebrow="Admin Workspace" copy="Review important actions such as job creation, status changes, interview scheduling, and recorded results." />
      <ResourceState loading={audit.loading} error={audit.error} />
      <Card>
        <CardContent>
          <DataTable columns={auditColumns()} data={audit.data?.items ?? []} emptyText="No audit events have been recorded." />
        </CardContent>
      </Card>
    </>
  );
}

function AdminDataQuality() {
  const report = useAsyncData(() => api.adminDataQuality(), []);
  const duplicateCandidates = (report.data?.duplicate_candidates as unknown as AnyRecord[]) ?? [];
  const suspiciousJobs = (report.data?.suspicious_jobs as unknown as AnyRecord[]) ?? [];
  const invalidEmployers = (report.data?.invalid_employers as unknown as AnyRecord[]) ?? [];

  return (
    <>
      <PageHeader title="Data Quality" eyebrow="Admin Workspace" copy="Find records that need cleanup: duplicate candidates, suspicious jobs, and invalid employer profiles." />
      <ResourceState loading={report.loading} error={report.error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Duplicate Candidates" value={duplicateCandidates.length} />
        <Metric label="Suspicious Jobs" value={suspiciousJobs.length} />
        <Metric label="Invalid Employers" value={invalidEmployers.length} />
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="Duplicate Candidates" icon={<Users size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={genericColumns(["FullName", "PhoneNumber", "DuplicateCount"])} data={duplicateCandidates} emptyText="No duplicate candidates found." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle title="Suspicious Jobs" icon={<BriefcaseBusiness size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={genericColumns(["PositionID", "EmployerID", "Title", "Status", "PostedDate"])} data={suspiciousJobs} emptyText="No suspicious jobs found." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle title="Invalid Employers" icon={<Building2 size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={genericColumns(["EmployerID", "CompanyName", "ContactNumber", "Address"])} data={invalidEmployers} emptyText="No invalid employers found." />
        </CardContent>
      </Card>
    </>
  );
}

function AdminFilters({
  search,
  setSearch,
  status,
  setStatus,
  options
}: {
  search: string;
  setSearch: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  options: string[];
}) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" size={16} />
            <Input className="pl-10" placeholder="Search records" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminResetPasswordCard({
  rows,
  reset,
  setReset,
  onSubmit,
  labelKey
}: {
  rows: AnyRecord[];
  reset: { account_id: string; new_password: string; confirm_password: string };
  setReset: (value: { account_id: string; new_password: string; confirm_password: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  labelKey: string;
}) {
  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Reset Password" icon={<Shield size={18} />} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-4" onSubmit={onSubmit}>
          <Field label="Account">
            <Select value={reset.account_id} onChange={(event) => setReset({ ...reset, account_id: event.target.value })}>
              <option value="">Select account</option>
              {rows.map((row) => (
                <option key={String(row.AccountID)} value={String(row.AccountID)}>
                  #{row.AccountID} - {String(row[labelKey] ?? row.Email ?? "Account")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New Password">
            <Input
              type="password"
              value={reset.new_password}
              onChange={(event) => setReset({ ...reset, new_password: event.target.value })}
            />
          </Field>
          <Field label="Confirm Password">
            <Input
              type="password"
              value={reset.confirm_password}
              onChange={(event) => setReset({ ...reset, confirm_password: event.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <Button className="w-full" type="submit" disabled={!reset.account_id}>
              <Save size={16} />
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function WorkspaceShell({
  title,
  subtitle,
  role,
  nav,
  active,
  onSelect,
  onLogout,
  notice,
  children
}: {
  title: string;
  subtitle: string;
  role: string;
  nav: Array<[string, LucideIcon]>;
  active: string;
  onSelect: (page: string) => void;
  onLogout: () => void;
  notice: Notice;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="surface h-fit p-4 lg:sticky lg:top-6">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-navy text-white">
            {role === "Employer" ? <Building2 size={20} /> : role === "Admin" ? <Shield size={20} /> : <UserRound size={20} />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-base font-bold text-navy">{title}</p>
            <p className="truncate text-sm text-slate">{subtitle}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(label)}
              className={cn(
                "focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition",
                active === label ? "bg-navy text-white" : "text-slate hover:bg-canvas hover:text-navy"
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        <Button className="mt-5 w-full" variant="secondary" onClick={onLogout}>
          <LogOut size={16} />
          Sign Out
        </Button>
      </aside>

      <section className="space-y-5">
        <NoticeBanner notice={notice} />
        {children}
      </section>
    </div>
  );
}

function EmployerDashboard({ employerId }: { employerId: number }) {
  const [trendYear, setTrendYear] = useState(2026);
  const metrics = useAsyncData(() => api.employerMetrics(employerId), [employerId]);
  const summary = useAsyncData(() => api.employerJobSummary(employerId), [employerId]);
  const applications = useAsyncData(() => api.employerApplications(employerId), [employerId]);
  const interviews = useAsyncData(() => api.employerInterviews(employerId), [employerId]);
  const passRateTrend = useAsyncData(
    () => {
      const demoRows = passRateTrendRows(trendYear);
      if (demoRows) {
        return Promise.resolve({ count: demoRows.length, items: demoRows });
      }
      return api.employerPassRateTrend(employerId, trendYear);
    },
    [employerId, trendYear]
  );
  const summaryRows = summary.data?.items ?? [];
  const applicationRows = applications.data?.items ?? [];
  const interviewRows = interviews.data?.items ?? [];
  const metricRow = metrics.data;

  const positionChart = summaryRows.slice(0, 8).map((row) => ({
    name: shortText(row.PositionTitle, 18),
    applications: toNumber(row.TotalApplications)
  }));
  const interviewCounts = countBy(interviewRows, "Result");
  const calculatedPassRate = metricValue(metricRow, "TotalInterviews")
    ? Math.round((metricValue(metricRow, "PassedInterviews") / metricValue(metricRow, "TotalInterviews")) * 1000) / 10
    : 0;
  const passRate = metricValue(metricRow, "PassRate") || calculatedPassRate;
  const trendRows = passRateTrend.data?.items ?? [];

  return (
    <>
      <PageHeader title="Project Overview" eyebrow="Employer Workspace" copy="Monitor job inventory, applications, interviews, and pass-rate signals from one workspace." />
      <ResourceState loading={metrics.loading} error={metrics.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total Jobs" value={metricValue(metricRow, "TotalPositions")} />
        <Metric label="Open Jobs" value={metricValue(metricRow, "OpenPositions")} />
        <Metric label="Applications" value={metricValue(metricRow, "TotalApplications")} />
        <Metric label="Pass Rate" value={`${passRate.toFixed(1)}%`} />
        <Metric label="Average Score" value={metricValue(metricRow, "AverageInterviewScore").toFixed(2)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <SectionTitle title="Applications by Position" icon={<BarChart3 size={18} />} />
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={positionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="applications" fill="#059669" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Interview Outcomes" icon={<Activity size={18} />} />
          </CardHeader>
          <CardContent className="h-80">
            <OutcomePie counts={interviewCounts} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionTitle title="Pass Rate Trend" icon={<Activity size={18} />} />
              <Select
                className="w-full sm:w-36"
                value={String(trendYear)}
                onChange={(event) => setTrendYear(Number(event.target.value))}
              >
                {passRateYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResourceState loading={passRateTrend.loading} error={passRateTrend.error} />
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="MonthLabel" />
                <YAxis domain={[0, 100]} tickFormatter={(nextValue) => `${nextValue}%`} />
                <Tooltip
                  formatter={(nextValue, name) => [
                    name === "PassRate" ? `${Number(nextValue).toFixed(1)}%` : nextValue,
                    name === "PassRate" ? "Pass Rate" : name
                  ]}
                  labelFormatter={(label) => `${label} ${trendYear}`}
                />
                <Bar dataKey="PassRate" fill="#0EA5E9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Recent Applications" icon={<ClipboardList size={18} />} />
          </CardHeader>
          <CardContent>
            <DataTable columns={applicationColumns()} data={applicationRows.slice(0, 6)} emptyText="No applications yet." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EmployerJobs({ employerId, setNotice }: { employerId: number; setNotice: (notice: Notice) => void }) {
  const jobs = useAsyncData(() => api.employerJobs(employerId), [employerId]);
  const summary = useAsyncData(() => api.employerJobSummary(employerId), [employerId]);
  const [form, setForm] = useState({ title: "", job_description: "", requirements: "", status: "Open" });
  const [statusForm, setStatusForm] = useState({ positionId: "", status: "Open" });
  const rows = jobs.data?.items ?? [];
  const summaryRows = summary.data?.items ?? [];

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.createEmployerJob(employerId, form);
      setForm({ title: "", job_description: "", requirements: "", status: "Open" });
      jobs.reload();
      summary.reload();
      setNotice({ type: "success", text: "Job position created successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to create job." });
    }
  }

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (statusForm.status === "Closed" && !window.confirm("Close this job position? Candidates will no longer be able to apply.")) {
      return;
    }
    try {
      await api.updateEmployerJobStatus(employerId, Number(statusForm.positionId), statusForm.status);
      jobs.reload();
      summary.reload();
      setNotice({ type: "success", text: "Job status updated successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update job." });
    }
  }

  return (
    <>
      <PageHeader title="Job Management" eyebrow="Employer Workspace" copy="Create positions and control open or closed status through the backend job routines." />
      <ResourceState loading={jobs.loading || summary.loading} error={jobs.error || summary.error} />
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <SectionTitle title="Create Job Position" icon={<Plus size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={createJob}>
              <Field label="Title">
                <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </Field>
              <Field label="Job Description">
                <Textarea value={form.job_description} onChange={(event) => setForm({ ...form, job_description: event.target.value })} />
              </Field>
              <Field label="Requirements">
                <Textarea value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} />
              </Field>
              <Field label="Initial Status">
                <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option>Open</option>
                  <option>Closed</option>
                </Select>
              </Field>
              <Button type="submit">
                <Plus size={16} />
                Create Position
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Update Status" icon={<Save size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={updateStatus}>
              <Field label="Position">
                <Select
                  value={statusForm.positionId}
                  onChange={(event) => setStatusForm({ ...statusForm, positionId: event.target.value })}
                >
                  <option value="">Select a position</option>
                  {rows.map((row) => (
                    <option key={String(row.PositionID)} value={String(row.PositionID)}>
                      #{row.PositionID} - {row.Title} ({row.Status})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="New Status">
                <Select value={statusForm.status} onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}>
                  <option>Open</option>
                  <option>Closed</option>
                </Select>
              </Field>
              <Button type="submit" disabled={!statusForm.positionId}>
                <Save size={16} />
                Update Status
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="Owned Positions" icon={<BriefcaseBusiness size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={jobColumns()} data={rows} emptyText="No jobs have been created." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle title="Position Snapshot" icon={<BarChart3 size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={summaryColumns()} data={summaryRows} emptyText="No job summary records available." />
        </CardContent>
      </Card>
    </>
  );
}

function EmployerApplications({ employerId, setNotice }: { employerId: number; setNotice: (notice: Notice) => void }) {
  const applications = useAsyncData(() => api.employerApplications(employerId), [employerId]);
  const pending = useAsyncData(() => api.employerPendingInterviews(employerId), [employerId]);
  const shortlisted = useAsyncData(() => api.employerShortlisted(employerId), [employerId]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [statusUpdate, setStatusUpdate] = useState({ application_id: "", status: "Reviewed" });
  const rows = applications.data?.items ?? [];
  const filtered = rows.filter((row) => {
    const haystack = `${row.CandidateName ?? ""} ${row.PositionTitle ?? ""} ${row.CompanyName ?? ""}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = status === "All" || row.ApplicationStatus === status;
    return matchesSearch && matchesStatus;
  });
  const statuses = ["All", ...Array.from(new Set(rows.map((row) => String(row.ApplicationStatus ?? "Unknown"))))];
  const candidateIds = Array.from(
    new Set(filtered.map((row) => toNumber(row.CandidateID)).filter((candidateId) => candidateId > 0))
  );
  const candidateProfileKey = candidateIds.join(",");
  const profiles = useAsyncData(
    () =>
      candidateIds.length
        ? api.employerCandidateProfiles(employerId, candidateIds)
        : Promise.resolve({ count: 0, items: {} }),
    [employerId, candidateProfileKey]
  );

  async function updateApplicationStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (statusUpdate.status === "Rejected" && !window.confirm("Reject this application without scheduling an interview?")) {
      return;
    }
    try {
      await api.updateEmployerApplicationStatus(employerId, Number(statusUpdate.application_id), statusUpdate.status);
      applications.reload();
      pending.reload();
      shortlisted.reload();
      setNotice({ type: "success", text: "Application status updated successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update application status." });
    }
  }

  return (
    <>
      <PageHeader title="Applications Pipeline" eyebrow="Employer Workspace" copy="Review applicants, filter by status, and identify candidates ready for interview scheduling." />
      <ResourceState
        loading={applications.loading || pending.loading || shortlisted.loading || profiles.loading}
        error={applications.error || pending.error || shortlisted.error || profiles.error}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total Applications" value={rows.length} />
        <Metric label="Ready to Schedule" value={pending.data?.count ?? 0} />
        <Metric label="Shortlisted" value={shortlisted.data?.count ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" size={16} />
              <Input className="pl-10" placeholder="Search candidate or position" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={applicationColumns()} data={filtered} emptyText="No applications matched the current filters." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionTitle title="Change Application Status" icon={<Save size={18} />} />
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_220px_auto]" onSubmit={updateApplicationStatus}>
            <Field label="Application">
              <Select
                value={statusUpdate.application_id}
                onChange={(event) => setStatusUpdate({ ...statusUpdate, application_id: event.target.value })}
              >
                <option value="">Select application</option>
                {rows.map((row) => (
                  <option key={String(row.ApplicationID)} value={String(row.ApplicationID)}>
                    App #{row.ApplicationID} - {row.CandidateName} for {row.PositionTitle} ({row.ApplicationStatus})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="New Status">
              <Select value={statusUpdate.status} onChange={(event) => setStatusUpdate({ ...statusUpdate, status: event.target.value })}>
                <option>Pending</option>
                <option>Reviewed</option>
                <option>Rejected</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button className="w-full" type="submit" disabled={!statusUpdate.application_id}>
                <Save size={16} />
                Update
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <ApplicantProfiles records={filtered} profiles={profiles.data?.items ?? {}} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle title="Ready for Interview" icon={<CalendarDays size={18} />} />
          </CardHeader>
          <CardContent>
            <DataTable columns={applicationColumns()} data={pending.data?.items ?? []} emptyText="No applicants are ready for scheduling." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Shortlisted Candidates" icon={<Users size={18} />} />
          </CardHeader>
          <CardContent>
            <DataTable columns={shortlistColumns()} data={shortlisted.data?.items ?? []} emptyText="No shortlisted candidates yet." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ApplicantProfiles({
  records,
  profiles
}: {
  records: AnyRecord[];
  profiles: Record<string, AnyRecord>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge>Profiles</Badge>
            <h2 className="mt-3 font-heading text-2xl font-bold text-navy">Applicant Profiles</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Open any applicant below to review their detailed profile and application information.
            </p>
          </div>
          <Badge className="bg-white text-slate">{records.length} applicants</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {records.length ? (
          records.map((record, index) => {
            const profile = profiles[String(record.CandidateID)] ?? {};
            const candidateName = String(profile.FullName || record.CandidateName || "Unknown Candidate");
            const resumeUrl = assetUrl(profile.ResumeURL);
            return (
              <details
                key={`${record.ApplicationID}-${record.CandidateID}`}
                className="group overflow-hidden rounded-lg border border-line bg-white shadow-sm"
                open={index === 0}
              >
                <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-heading text-base font-bold text-navy transition hover:bg-canvas">
                  <span className="text-xs text-slate transition group-open:rotate-90">{">"}</span>
                  {candidateName} | {String(record.PositionTitle || "Position")} | App #{String(record.ApplicationID || "-")}
                </summary>
                <div className="grid gap-8 border-t border-line bg-canvas/40 p-5 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-4 font-heading text-lg font-bold text-navy">Candidate Profile</h3>
                    <ProfileLine label="Full Name" value={candidateName} />
                    <ProfileLine label="Candidate ID" value={record.CandidateID} />
                    <ProfileLine label="Date of Birth" value={profile.DateOfBirth} />
                    <ProfileLine label="Phone Number" value={profile.PhoneNumber} />
                    <div className="py-1.5 text-sm">
                      <span className="font-bold text-navy">Resume: </span>
                      {resumeUrl ? (
                        <a className="font-semibold text-blue-700 underline" href={resumeUrl} target="_blank" rel="noreferrer">
                          Open Resume
                        </a>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-4 font-heading text-lg font-bold text-navy">Application Details</h3>
                    <ProfileLine label="Company" value={record.CompanyName} />
                    <ProfileLine label="Position" value={record.PositionTitle} />
                    <ProfileLine label="Application ID" value={record.ApplicationID} />
                    <ProfileLine label="Application Status" value={record.ApplicationStatus} />
                    <ProfileLine label="Applied At" value={formatDate(record.ApplicationDate)} />
                    {record.InterviewDate ? (
                      <>
                        <ProfileLine label="Interview Date" value={formatDate(record.InterviewDate)} />
                        <ProfileLine label="Interview Result" value={record.InterviewResult || "Pending"} />
                        <ProfileLine label="Interview Score" value={record.InterviewScore} />
                        <ProfileLine label="Location / Link" value={record.LocationOrLink} />
                      </>
                    ) : null}
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <div className="rounded-lg border border-line bg-canvas px-4 py-6 text-center text-sm font-semibold text-slate">
            No applicant profiles match the current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileLine({ label, value: lineValue }: { label: string; value: unknown }) {
  const displayValue = lineValue === null || lineValue === undefined || lineValue === "" ? "-" : String(lineValue);
  return (
    <p className="py-1.5 text-sm text-slate">
      <span className="font-bold text-navy">{label}: </span>
      {displayValue}
    </p>
  );
}

function EmployerInterviews({ employerId, setNotice }: { employerId: number; setNotice: (notice: Notice) => void }) {
  const pending = useAsyncData(() => api.employerPendingInterviews(employerId), [employerId]);
  const interviews = useAsyncData(() => api.employerInterviews(employerId), [employerId]);
  const applications = useAsyncData(() => api.employerApplications(employerId), [employerId]);
  const [schedule, setSchedule] = useState({ application_id: "", date: "", time: "09:00", location_or_link: "", notes: "" });
  const [result, setResult] = useState({ application_id: "", result: "Pass", score: "8", notes: "" });
  const scorable = (applications.data?.items ?? []).filter((row) => row.InterviewDate);

  async function scheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.scheduleInterview(employerId, {
        application_id: Number(schedule.application_id),
        interview_date: `${schedule.date}T${schedule.time}:00`,
        location_or_link: schedule.location_or_link,
        notes: schedule.notes
      });
      pending.reload();
      interviews.reload();
      applications.reload();
      setNotice({ type: "success", text: "Interview scheduled successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to schedule interview." });
    }
  }

  async function recordResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (result.result !== "Pending" && !window.confirm(`Record this interview as ${result.result}? This will update the application status.`)) {
      return;
    }
    try {
      await api.recordInterviewResult(employerId, {
        application_id: Number(result.application_id),
        result: result.result,
        score: result.result === "Pending" ? null : Number(result.score),
        notes: result.notes
      });
      interviews.reload();
      applications.reload();
      setNotice({ type: "success", text: "Interview result recorded successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to record result." });
    }
  }

  return (
    <>
      <PageHeader title="Interview Management" eyebrow="Employer Workspace" copy="Schedule interviews and record outcomes through backend routines and database triggers." />
      <ResourceState loading={pending.loading || interviews.loading || applications.loading} error={pending.error || interviews.error || applications.error} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle title="Schedule Interview" icon={<CalendarDays size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={scheduleInterview}>
              <Field label="Application">
                <Select
                  value={schedule.application_id}
                  onChange={(event) => setSchedule({ ...schedule, application_id: event.target.value })}
                >
                  <option value="">Select application</option>
                  {(pending.data?.items ?? []).map((row) => (
                    <option key={String(row.ApplicationID)} value={String(row.ApplicationID)}>
                      App #{row.ApplicationID} - {row.CandidateName} for {row.PositionTitle}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date">
                  <Input type="date" value={schedule.date} onChange={(event) => setSchedule({ ...schedule, date: event.target.value })} />
                </Field>
                <Field label="Time">
                  <Input type="time" value={schedule.time} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} />
                </Field>
              </div>
              <Field label="Location or Link">
                <Input
                  value={schedule.location_or_link}
                  onChange={(event) => setSchedule({ ...schedule, location_or_link: event.target.value })}
                />
              </Field>
              <Field label="Notes">
                <Textarea value={schedule.notes} onChange={(event) => setSchedule({ ...schedule, notes: event.target.value })} />
              </Field>
              <Button type="submit" disabled={!schedule.application_id || !schedule.date}>
                <CalendarDays size={16} />
                Schedule
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Record Result" icon={<Save size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={recordResult}>
              <Field label="Application">
                <Select value={result.application_id} onChange={(event) => setResult({ ...result, application_id: event.target.value })}>
                  <option value="">Select application</option>
                  {scorable.map((row) => (
                    <option key={String(row.ApplicationID)} value={String(row.ApplicationID)}>
                      App #{row.ApplicationID} - {row.CandidateName} for {row.PositionTitle}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Result">
                  <Select value={result.result} onChange={(event) => setResult({ ...result, result: event.target.value })}>
                    <option>Pass</option>
                    <option>Fail</option>
                    <option>Pending</option>
                  </Select>
                </Field>
                <Field label="Score">
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    disabled={result.result === "Pending"}
                    value={result.score}
                    onChange={(event) => setResult({ ...result, score: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea value={result.notes} onChange={(event) => setResult({ ...result, notes: event.target.value })} />
              </Field>
              <Button type="submit" disabled={!result.application_id}>
                <Save size={16} />
                Record Result
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="Interview History" icon={<Activity size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={interviewColumns()} data={interviews.data?.items ?? []} emptyText="No interviews are recorded yet." />
        </CardContent>
      </Card>
    </>
  );
}

function EmployerPerformance({ employerId }: { employerId: number }) {
  const summary = useAsyncData(() => api.employerJobSummary(employerId), [employerId]);
  const interviews = useAsyncData(() => api.employerInterviews(employerId), [employerId]);
  const rows = summary.data?.items ?? [];
  const outcomes = countBy(interviews.data?.items ?? [], "Result");
  const chartRows = rows.map((row) => ({
    name: shortText(row.PositionTitle, 16),
    applications: toNumber(row.TotalApplications),
    accepted: toNumber(row.AcceptedApplications),
    interviewing: toNumber(row.InterviewingApplications),
    score: toNumber(row.AverageInterviewScore)
  }));

  return (
    <>
      <PageHeader title="Performance Analytics" eyebrow="Employer Workspace" copy="Rank job positions by volume, accepted candidates, active interviews, and average interview score." />
      <ResourceState loading={summary.loading || interviews.loading} error={summary.error || interviews.error} />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <SectionTitle title="Hiring Performance" icon={<BarChart3 size={18} />} />
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="applications" fill="#059669" radius={[8, 8, 0, 0]} />
                <Bar dataKey="accepted" fill="#0EA5E9" radius={[8, 8, 0, 0]} />
                <Bar dataKey="interviewing" fill="#EAB308" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Outcome Mix" icon={<Activity size={18} />} />
          </CardHeader>
          <CardContent className="h-96">
            <OutcomePie counts={outcomes} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="Position Ranking" icon={<ClipboardList size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={summaryColumns()} data={rows} emptyText="No performance records available." />
        </CardContent>
      </Card>
    </>
  );
}

function CandidateJobBoard({ candidateId, setNotice }: { candidateId: number; setNotice: (notice: Notice) => void }) {
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<AnyRecord | null>(null);
  const deferredSearch = useDeferredValue(search);
  const jobs = useAsyncData(() => api.openJobs(deferredSearch), [deferredSearch]);
  const applications = useAsyncData(() => api.candidateApplications(candidateId), [candidateId]);
  const appliedPositionIds = new Set((applications.data?.items ?? []).map((row) => Number(row.PositionID)));

  async function apply(positionId: number) {
    try {
      await api.submitApplication(candidateId, positionId);
      applications.reload();
      setNotice({ type: "success", text: "Application submitted successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to submit application." });
    }
  }

  return (
    <>
      <PageHeader title="Job Board" eyebrow="Candidate Workspace" copy="Browse open positions from all employers and apply using your candidate profile." />
      <ResourceState loading={jobs.loading || applications.loading} error={jobs.error || applications.error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Open Jobs" value={jobs.data?.count ?? 0} />
        <Metric label="My Applications" value={applications.data?.count ?? 0} />
        <Metric label="Scheduled Interviews" value={(applications.data?.items ?? []).filter((row) => row.InterviewDate).length} />
      </div>
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" size={16} />
            <Input className="pl-10" placeholder="Search jobs, companies, or requirements" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={openJobColumns(apply, setSelectedJob, appliedPositionIds)}
            data={jobs.data?.items ?? []}
            emptyText="No open jobs match the current search."
          />
        </CardContent>
      </Card>
      {selectedJob ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge>Job Detail</Badge>
                <h2 className="mt-3 font-heading text-2xl font-bold text-navy">{String(selectedJob.Title ?? "Open Position")}</h2>
                <p className="mt-2 text-sm text-slate">{String(selectedJob.CompanyName ?? "Company")} | Job #{String(selectedJob.PositionID ?? "-")}</p>
              </div>
              <Button
                disabled={appliedPositionIds.has(Number(selectedJob.PositionID))}
                onClick={() => apply(Number(selectedJob.PositionID))}
              >
                <FileText size={16} />
                {appliedPositionIds.has(Number(selectedJob.PositionID)) ? "Applied" : "Apply"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 font-heading font-bold text-navy">Job Description</h3>
              <p className="whitespace-pre-line text-sm leading-6 text-slate">{String(selectedJob.JobDescription || "-")}</p>
            </div>
            <div>
              <h3 className="mb-2 font-heading font-bold text-navy">Requirements</h3>
              <p className="whitespace-pre-line text-sm leading-6 text-slate">{String(selectedJob.Requirements || "-")}</p>
              <div className="mt-4 rounded-lg border border-line bg-canvas p-4 text-sm text-slate">
                <ProfileLine label="Company" value={selectedJob.CompanyName} />
                <ProfileLine label="Employer ID" value={selectedJob.EmployerID} />
                <ProfileLine label="Posted Date" value={formatDate(selectedJob.PostedDate)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function CandidateApplications({ candidateId }: { candidateId: number }) {
  const applications = useAsyncData(() => api.candidateApplications(candidateId), [candidateId]);
  const rows = applications.data?.items ?? [];
  const breakdown = countBy(rows, "ApplicationStatus");

  return (
    <>
      <PageHeader title="My Applications" eyebrow="Candidate Workspace" copy="Track every application and follow the hiring status for each position." />
      <ResourceState loading={applications.loading} error={applications.error} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Total" value={rows.length} />
        <Metric label="Pending" value={breakdown.Pending ?? 0} />
        <Metric label="Interviewing" value={breakdown.Interviewing ?? 0} />
        <Metric label="Accepted" value={breakdown.Accepted ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <SectionTitle title="Application Tracker" icon={<FileText size={18} />} />
        </CardHeader>
        <CardContent>
          <DataTable columns={applicationColumns()} data={rows} emptyText="No applications have been submitted." />
        </CardContent>
      </Card>
    </>
  );
}

function CandidateInterviews({ candidateId }: { candidateId: number }) {
  const interviews = useAsyncData(() => api.candidateInterviews(candidateId), [candidateId]);
  const rows = interviews.data?.items ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((row) => String(row.InterviewDate ?? "").slice(0, 10) >= today);

  return (
    <>
      <PageHeader title="My Interviews" eyebrow="Candidate Workspace" copy="Review interview dates, meeting details, and outcomes from one place." />
      <ResourceState loading={interviews.loading} error={interviews.error} />
      <NotificationsPanel />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle title="Upcoming" icon={<CalendarDays size={18} />} />
          </CardHeader>
          <CardContent>
            <DataTable columns={interviewColumns()} data={upcoming} emptyText="No upcoming interviews." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="All Interviews" icon={<Activity size={18} />} />
          </CardHeader>
          <CardContent>
            <DataTable columns={interviewColumns()} data={rows} emptyText="No interviews are scheduled." />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function NotificationsPanel() {
  const notifications = useAsyncData(() => api.notifications(), []);
  const rows = notifications.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Notifications" icon={<Activity size={18} />} />
      </CardHeader>
      <CardContent>
        <ResourceState loading={notifications.loading} error={notifications.error} />
        <DataTable columns={notificationColumns()} data={rows} emptyText="No notifications yet." />
      </CardContent>
    </Card>
  );
}

function CandidateProfile({
  user,
  candidateId,
  setNotice
}: {
  user: AuthUser;
  candidateId: number;
  setNotice: (notice: Notice) => void;
}) {
  const profile = useAsyncData(() => api.candidateProfile(candidateId), [candidateId]);
  const [form, setForm] = useState({ full_name: "", date_of_birth: "", phone_number: "", resume_url: "" });
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    if (profile.data) {
      setForm({
        full_name: String(profile.data.FullName ?? ""),
        date_of_birth: String(profile.data.DateOfBirth ?? ""),
        phone_number: String(profile.data.PhoneNumber ?? ""),
        resume_url: String(profile.data.ResumeURL ?? "")
      });
    }
  }, [profile.data]);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.updateCandidateProfile(candidateId, {
        full_name: form.full_name,
        date_of_birth: form.date_of_birth || null,
        phone_number: form.phone_number || null,
        resume_url: form.resume_url || null
      });
      profile.reload();
      setNotice({ type: "success", text: "Profile updated successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to update profile." });
    }
  }

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeFile) {
      setNotice({ type: "error", text: "Please select a CV file before uploading." });
      return;
    }
    try {
      await api.uploadCandidateResume(candidateId, resumeFile);
      setResumeFile(null);
      profile.reload();
      setNotice({ type: "success", text: "CV uploaded successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to upload CV." });
    }
  }

  return (
    <>
      <PageHeader title="My Profile" eyebrow="Candidate Workspace" copy="Keep your candidate profile accurate for applications and interview workflows." />
      <ResourceState loading={profile.loading} error={profile.error} />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <SectionTitle title="Current Details" icon={<UserRound size={18} />} />
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate">
            <Detail label="Full Name" value={profile.data?.FullName} />
            <Detail label="Phone" value={profile.data?.PhoneNumber} />
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <span className="font-semibold text-navy">Resume</span>
              {profile.data?.ResumeURL ? (
                <a className="max-w-[65%] break-words text-right font-semibold text-blue-700 underline" href={assetUrl(profile.data.ResumeURL)} target="_blank" rel="noreferrer">
                  Open Resume
                </a>
              ) : (
                <span className="text-slate">-</span>
              )}
            </div>
            <Detail label="Date of Birth" value={profile.data?.DateOfBirth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Upload CV File" icon={<FileText size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={uploadResume}>
              <Field label="CV File">
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                />
              </Field>
              <Button type="submit" disabled={!resumeFile}>
                <FileText size={16} />
                Upload CV
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle title="Update Profile" icon={<Save size={18} />} />
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={updateProfile}>
              <Field label="Full Name">
                <Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </Field>
              <Field label="Date of Birth">
                <Input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
              </Field>
              <Field label="Phone Number">
                <Input value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} />
              </Field>
              <Field label="Resume URL">
                <Input value={form.resume_url} onChange={(event) => setForm({ ...form, resume_url: event.target.value })} />
              </Field>
              <Button type="submit">
                <Save size={16} />
                Update Profile
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <AccountSecurity user={user} setNotice={setNotice} />
    </>
  );
}

function AccountSecurity({ user, setNotice }: { user: AuthUser; setNotice: (notice: Notice) => void }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.changePassword({ account_id: user.account_id, ...form });
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setNotice({ type: "success", text: "Password updated successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Unable to change password." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Account Security" icon={<Shield size={18} />} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={submit}>
          <Field label="Current Password">
            <Input
              type="password"
              value={form.current_password}
              onChange={(event) => setForm({ ...form, current_password: event.target.value })}
            />
          </Field>
          <Field label="New Password">
            <Input type="password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} />
          </Field>
          <Field label="Confirm Password">
            <Input
              type="password"
              value={form.confirm_password}
              onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
            />
          </Field>
          <Button className="md:col-span-3 md:w-fit" type="submit">
            <Save size={16} />
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PasswordPair({
  password,
  confirm,
  onPassword,
  onConfirm
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Password">
        <Input type="password" value={password} onChange={(event) => onPassword(event.target.value)} />
      </Field>
      <Field label="Confirm Password">
        <Input type="password" value={confirm} onChange={(event) => onConfirm(event.target.value)} />
      </Field>
    </div>
  );
}

function Feature({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 inline-flex rounded bg-sage/10 p-2 text-sage">{icon}</div>
      <p className="font-heading font-bold text-navy">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate">{copy}</p>
    </div>
  );
}

function PageHeader({ title, eyebrow, copy }: { title: string; eyebrow: string; copy: string }) {
  return (
    <header className="surface p-5">
      <Badge>{eyebrow}</Badge>
      <h1 className="mt-3 font-heading text-3xl font-extrabold leading-tight text-navy">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">{copy}</p>
    </header>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-heading text-base font-bold text-navy">
      <span className="text-sage">{icon}</span>
      {title}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-bold uppercase tracking-[0.5px] text-slate">{label}</p>
        <p className="mt-2 font-mono text-3xl font-semibold text-navy">{value}</p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value: detailValue }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="font-semibold text-navy">{label}</span>
      <span className="max-w-[65%] break-words text-right">{String(detailValue || "-")}</span>
    </div>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) {
    return null;
  }
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm font-semibold",
        notice.type === "success" ? "border-success/30 bg-success/10 text-green-700" : "border-danger/30 bg-danger/10 text-red-700"
      )}
    >
      {notice.text}
    </div>
  );
}

function ResourceState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-slate">Loading data...</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>;
  }
  return null;
}

function OutcomePie({ counts }: { counts: Record<string, number> }) {
  const data = Object.entries(counts)
    .filter(([, nextValue]) => nextValue > 0)
    .map(([name, nextValue]) => ({ name, value: nextValue }));

  if (!data.length) {
    return <div className="grid h-full place-items-center text-sm font-semibold text-slate">No interview outcomes yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={4}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function adminEmployerColumns(
  onApproval: (employerId: number, status: string) => void,
  onAccountStatus: (accountId: number, status: string) => void
): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Employer",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "CompanyName")}</p>
          <p className="text-xs text-slate">Employer #{value(row.original, "EmployerID")} | {value(row.original, "Email")}</p>
        </div>
      )
    },
    {
      header: "Approval",
      cell: ({ row }) => <Badge status={row.original.ApprovalStatus}>{String(row.original.ApprovalStatus ?? "Unknown")}</Badge>
    },
    {
      header: "Account",
      cell: ({ row }) => <Badge status={row.original.AccountStatus}>{String(row.original.AccountStatus ?? "Active")}</Badge>
    },
    {
      header: "Contact",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.ContactNumber || row.original.Address, 56)}</span>
    },
    {
      header: "Actions",
      cell: ({ row }) => {
        const employerId = Number(row.original.EmployerID);
        const accountId = Number(row.original.AccountID);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onApproval(employerId, "Approved")}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onApproval(employerId, "Pending")}>
              Pending
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onApproval(employerId, "Rejected")}>
              Reject
            </Button>
            <Button
              size="sm"
              variant={row.original.AccountStatus === "Disabled" ? "secondary" : "destructive"}
              onClick={() => {
                const nextStatus = row.original.AccountStatus === "Disabled" ? "Active" : "Disabled";
                if (nextStatus === "Disabled" && !window.confirm("Disable this employer account?")) {
                  return;
                }
                onAccountStatus(accountId, nextStatus);
              }}
            >
              {row.original.AccountStatus === "Disabled" ? "Enable" : "Disable"}
            </Button>
          </div>
        );
      }
    }
  ];
}

function adminCandidateColumns(onAccountStatus: (accountId: number, status: string) => void): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Candidate",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "FullName")}</p>
          <p className="text-xs text-slate">Candidate #{value(row.original, "CandidateID")} | {value(row.original, "Email")}</p>
        </div>
      )
    },
    {
      header: "Account",
      cell: ({ row }) => <Badge status={row.original.AccountStatus}>{String(row.original.AccountStatus ?? "Active")}</Badge>
    },
    {
      header: "Phone",
      cell: ({ row }) => String(value(row.original, "PhoneNumber"))
    },
    {
      header: "Resume",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.ResumeURL, 48)}</span>
    },
    {
      header: "Actions",
      cell: ({ row }) => {
        const accountId = Number(row.original.AccountID);
        const nextStatus = row.original.AccountStatus === "Disabled" ? "Active" : "Disabled";
        return (
          <Button
            size="sm"
            variant={nextStatus === "Disabled" ? "destructive" : "secondary"}
            onClick={() => {
              if (nextStatus === "Disabled" && !window.confirm("Disable this candidate account?")) {
                return;
              }
              onAccountStatus(accountId, nextStatus);
            }}
          >
            {nextStatus === "Disabled" ? "Disable" : "Enable"}
          </Button>
        );
      }
    }
  ];
}

function adminJobColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Job",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "Title")}</p>
          <p className="text-xs text-slate">#{value(row.original, "PositionID")} | {value(row.original, "CompanyName")}</p>
        </div>
      )
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.Status}>{String(row.original.Status ?? "Unknown")}</Badge>
    },
    {
      header: "Requirements",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.Requirements || row.original.JobDescription, 84)}</span>
    },
    {
      header: "Posted",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.PostedDate)}</span>
    }
  ];
}

function auditColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Event",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "Action")}</p>
          <p className="text-xs text-slate">
            {value(row.original, "EntityType")} #{value(row.original, "EntityID")}
          </p>
        </div>
      )
    },
    {
      header: "Actor",
      cell: ({ row }) => `${value(row.original, "ActorRole")} #${value(row.original, "ActorAccountID")}`
    },
    {
      header: "Details",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.Details, 92)}</span>
    },
    {
      header: "Created",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.CreatedAt)}</span>
    }
  ];
}

function notificationColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Notification",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "Title")}</p>
          <p className="text-xs text-slate">{shortText(row.original.Message, 92)}</p>
        </div>
      )
    },
    {
      header: "Created",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.CreatedAt)}</span>
    }
  ];
}

function genericColumns(keys: string[]): ColumnDef<AnyRecord>[] {
  return keys.map((key) => ({
    header: key,
    cell: ({ row }) => {
      const nextValue = row.original[key];
      if (key.toLowerCase().includes("date") || key.toLowerCase().includes("created")) {
        return <span className="font-mono text-xs text-slate">{formatDate(nextValue)}</span>;
      }
      return <span className="text-slate">{shortText(nextValue, 72)}</span>;
    }
  }));
}

function openJobColumns(
  onApply: (positionId: number) => void,
  onInspect: (job: AnyRecord) => void,
  appliedPositionIds: Set<number>
): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Position",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "Title")}</p>
          <p className="text-xs text-slate">#{value(row.original, "PositionID")} at {value(row.original, "CompanyName")}</p>
        </div>
      )
    },
    {
      header: "Requirements",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.Requirements || row.original.JobDescription, 92)}</span>
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.Status}>{String(row.original.Status)}</Badge>
    },
    {
      header: "Posted",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.PostedDate)}</span>
    },
    {
      header: "Action",
      cell: ({ row }) => {
        const positionId = Number(row.original.PositionID);
        const applied = appliedPositionIds.has(positionId);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onInspect(row.original)}>
              Details
            </Button>
            <Button size="sm" variant={applied ? "secondary" : "primary"} disabled={applied} onClick={() => onApply(positionId)}>
              {applied ? "Applied" : "Apply"}
            </Button>
          </div>
        );
      }
    }
  ];
}

function jobColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Job",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "Title")}</p>
          <p className="text-xs text-slate">#{value(row.original, "PositionID")}</p>
        </div>
      )
    },
    {
      header: "Requirements",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.Requirements || row.original.JobDescription, 84)}</span>
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.Status}>{String(row.original.Status)}</Badge>
    },
    {
      header: "Posted",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.PostedDate)}</span>
    }
  ];
}

function applicationColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Application",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "CandidateName")}</p>
          <p className="text-xs text-slate">App #{value(row.original, "ApplicationID")} for {value(row.original, "PositionTitle")}</p>
        </div>
      )
    },
    {
      header: "Company",
      cell: ({ row }) => String(value(row.original, "CompanyName"))
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.ApplicationStatus}>{String(row.original.ApplicationStatus ?? "Unknown")}</Badge>
    },
    {
      header: "Applied",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.ApplicationDate)}</span>
    }
  ];
}

function shortlistColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Candidate",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "CandidateName")}</p>
          <p className="text-xs text-slate">{shortText(row.original.ResumeURL || row.original.PhoneNumber, 52)}</p>
        </div>
      )
    },
    {
      header: "Position",
      cell: ({ row }) => String(value(row.original, "PositionTitle"))
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.ApplicationStatus}>{String(row.original.ApplicationStatus ?? "Unknown")}</Badge>
    },
    {
      header: "Interview",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.InterviewDate)}</span>
    }
  ];
}

function interviewColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Interview",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "CandidateName")}</p>
          <p className="text-xs text-slate">{value(row.original, "PositionTitle")} | App #{value(row.original, "ApplicationID")}</p>
        </div>
      )
    },
    {
      header: "Result",
      cell: ({ row }) => <Badge status={row.original.Result || row.original.InterviewResult}>{String(row.original.Result || row.original.InterviewResult || "Pending")}</Badge>
    },
    {
      header: "Score",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.Score ?? row.original.InterviewScore ?? "-"}</span>
    },
    {
      header: "Location",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.LocationOrLink, 48)}</span>
    },
    {
      header: "Notes",
      cell: ({ row }) => <span className="text-slate">{shortText(row.original.Notes, 72)}</span>
    },
    {
      header: "Date",
      cell: ({ row }) => <span className="font-mono text-xs text-slate">{formatDate(row.original.InterviewDate)}</span>
    }
  ];
}

function summaryColumns(): ColumnDef<AnyRecord>[] {
  return [
    {
      header: "Position",
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-navy">{value(row.original, "PositionTitle")}</p>
          <p className="text-xs text-slate">#{value(row.original, "PositionID")} | {value(row.original, "CompanyName")}</p>
        </div>
      )
    },
    {
      header: "Status",
      cell: ({ row }) => <Badge status={row.original.PositionStatus}>{String(row.original.PositionStatus ?? "Unknown")}</Badge>
    },
    {
      header: "Applications",
      cell: ({ row }) => <span className="font-mono text-sm">{toNumber(row.original.TotalApplications)}</span>
    },
    {
      header: "Accepted",
      cell: ({ row }) => <span className="font-mono text-sm">{toNumber(row.original.AcceptedApplications)}</span>
    },
    {
      header: "Interviewing",
      cell: ({ row }) => <span className="font-mono text-sm">{toNumber(row.original.InterviewingApplications)}</span>
    },
    {
      header: "Avg Score",
      cell: ({ row }) => <span className="font-mono text-sm">{toNumber(row.original.AverageInterviewScore).toFixed(2)}</span>
    }
  ];
}

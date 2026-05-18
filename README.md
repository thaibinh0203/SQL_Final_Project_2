# Link to the web : https://sql-final-project-2.vercel.app/
Due to the fact that this project is using free version of Render, first few actions can takes a little longer processing time as these actions have to wait for the backend to wake up first, afterwards the process and actions will be a lot faster !!!

# Recruitment Management System

A full-stack recruitment management system for SQL Final Project 2. The project combines a MySQL database, FastAPI backend, Next.js frontend, optional legacy Streamlit interface, and cloud deployment support.

The system supports candidate registration, employer job posting, application tracking, interview scheduling, interview results, dashboards, admin controls, audit logs, notifications, and automated MySQL backup through GitHub Actions.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Database | MySQL, SQL schema, constraints, indexes, views, stored procedures, user-defined functions, triggers |
| Backend | Python 3, FastAPI, Uvicorn, SQLAlchemy, mysql-connector-python, Pydantic-style request models |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, TanStack Table, Recharts, Lucide React |
| Legacy UI | Streamlit, pandas, streamlit-option-menu |
| Deployment | Railway MySQL, Render backend, Vercel frontend |
| Operations | GitHub Actions cron backup, PowerShell restore script |

## Main Features

### Authentication and Security

- Email/password authentication.
- Password hashing with PBKDF2-SHA256, random salt, and 240,000 iterations.
- JWT-based API sessions.
- Role-based access control for `Admin`, `Employer`, and `Candidate`.
- Backend ownership checks to prevent users from accessing another user's data.
- Login rate limiting to reduce brute-force attempts.

### Candidate Workspace

- Browse all open job positions.
- Search jobs by title, company, description, or requirements.
- View job details before applying.
- Submit applications to open positions.
- Track application status.
- View scheduled interviews, interview location/link, result, score, and employer notes.
- Update profile information and resume URL or upload a CV file.
- Change account password.
- View notifications created when interviews are scheduled or results are updated.

### Employer Workspace

- Create job positions.
- Open or close job positions.
- View applications for employer-owned jobs.
- Search and filter applications.
- Review, reject, or shortlist applications.
- Schedule interviews with date, location/link, and notes.
- Record interview result, score, and notes.
- View dashboards for total jobs, open jobs, applications, interviews, pass/fail counts, average score, and hiring trends.

### Admin Workspace

- View all employers, candidates, jobs, applications, interviews, audit logs, and data quality signals.
- Approve, reject, or move employer accounts back to pending review.
- Enable or disable accounts.
- Reset account passwords.
- Review system metrics such as total users, jobs, applications, interviews, and pass rate.
- Inspect suspicious jobs, duplicate candidates, and invalid employer records.

### Database Features

- Normalized relational schema for accounts, employers, candidates, job positions, applications, interviews, notifications, and audit logs.
- Primary keys, foreign keys, unique constraints, check constraints, and enum status fields.
- Indexes for job status, application status, and interview date.
- Views for open jobs, candidate application tracking, shortlisted candidates, job application summaries, interview results, employer dashboard metrics, and admin metrics.
- Stored procedures for job creation, job status updates, application submission, interview scheduling, and interview result recording.
- User-defined functions for application counts, candidate application counts, employer pass rate, and average interview score.
- Triggers that synchronize `Applications.Status` with `Interviews.Result`.

## Project Structure

```text
backend/
  api.py                 FastAPI routes and request models
  config.py              Environment-backed settings
  crud.py                Database workflows, validation, auth helpers, audit/notification helpers
  db.py                  SQLAlchemy engine and session scope
  models.py              SQLAlchemy ORM models
  security.py            JWT helpers
  smoke_test.py          Minimal backend verification

database/
  cloud_00_reset.sql                 Optional destructive reset script
  cloud_01_schema.sql                Cloud schema, constraints, and indexes
  cloud_seed_510.sql                 Seed dataset
  cloud_02_views.sql                 Views
  cloud_03_routines.sql              Stored procedures and functions
  cloud_04_triggers.sql              Triggers
  cloud_05_admin_security_audit.sql  Admin, audit, and notification extension
  CLOUD_IMPORT_ORDER.md              Cloud import instructions
  backup/
    README.md              Backup/recovery documentation
    restore_mysql.ps1      Manual restore script

web/
  app/                   Next.js app router files
  components/            React UI components
  lib/                   API client, shared types, utilities
  package.json           Next.js dependencies and scripts

frontend/
  app.py                 Legacy Streamlit entrypoint
  pages/                 Legacy Streamlit pages
  views/                 Legacy Streamlit view helpers

.github/workflows/
  mysql-backup.yml       GitHub Actions cron database backup

render.yaml              Render backend deployment definition
railway.toml             Railway Docker backend config
requirements.txt         Python dependencies
```

## Local Setup

### 1. Install Python dependencies

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Install web dependencies

```powershell
cd web
npm install
cd ..
```

### 3. Configure environment variables

Create a local `.env` file in the project root:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_LOCAL_PASSWORD
DB_NAME=recruitment_management_system
DB_ECHO=false
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXP_MINUTES=120
FRONTEND_ORIGINS=http://localhost:3000
```

Create `web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Database Setup

For local development, import the SQL files in this order:

```text
database/init.sql
database/seed_510.sql
database/02_views.sql
database/03_routines.sql
database/04_triggers.sql
database/05_security.sql
database/cloud_06_admin_security_audit.sql
```

For Railway/cloud deployment, use the cloud scripts:

```text
database/cloud_00_reset.sql             optional, destructive
database/cloud_01_schema.sql
database/cloud_seed_510.sql
database/cloud_02_views.sql
database/cloud_03_routines.sql
database/cloud_04_triggers.sql
database/cloud_06_admin_security_audit.sql
```

After import, verify the main tables:

```sql
SELECT COUNT(*) FROM Accounts;
SELECT COUNT(*) FROM Employers;
SELECT COUNT(*) FROM Candidates;
SELECT COUNT(*) FROM JobPositions;
SELECT COUNT(*) FROM Applications;
SELECT COUNT(*) FROM Interviews;
```

## Running Locally

### FastAPI backend

```powershell
uvicorn backend.api:app --reload --host 0.0.0.0 --port 8000
```

Useful endpoints:

```text
http://localhost:8000/
http://localhost:8000/health
http://localhost:8000/docs
http://localhost:8000/smoke-test
```

### Next.js frontend

```powershell
cd web
npm run dev
```

Open:

```text
http://localhost:3000
```

### Backend smoke test

```powershell
python -m backend.smoke_test
```

The smoke test verifies database connection, demo login, dashboard data, open job listing, and candidate application/interview access.

### Optional legacy Streamlit app

```powershell
streamlit run frontend/app.py
```

The Streamlit app is kept as a legacy interface. The current primary frontend is the Next.js app in `web/`.

## Demo Accounts

Seeded demo logins use:

```text
Password: 1
```

Example accounts:

```text
Employer:  employer0001@example.com
Candidate: candidate0001@example.com
Admin:     admin@example.com
```

After importing `database/cloud_06_admin_security_audit.sql`, sign in as admin and reset the demo admin password before using a public deployment.

## Deployment

### Recommended architecture

```text
Vercel Next.js frontend
        |
        | REST API + JWT
        v
Render FastAPI backend
        |
        | SQLAlchemy + mysql-connector-python
        v
Railway MySQL database
```

The frontend never connects directly to MySQL. All database access goes through the FastAPI backend so authentication, authorization, validation, ownership checks, notifications, and audit logs can be enforced in one place.

### Railway MySQL

1. Create a Railway project.
2. Add a MySQL database service.
3. Use the public TCP proxy values when connecting from Render, GitHub Actions, or your own machine:
   - `RAILWAY_TCP_PROXY_DOMAIN`
   - `RAILWAY_TCP_PROXY_PORT`
4. Import the cloud SQL files in the documented order.

### Render backend

Create a Render Web Service with:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn backend.api:app --host 0.0.0.0 --port $PORT
```

Required environment variables:

```env
DB_HOST=YOUR_RAILWAY_TCP_PROXY_DOMAIN
DB_PORT=YOUR_RAILWAY_TCP_PROXY_PORT
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=YOUR_MYSQL_DATABASE
DB_ECHO=false
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXP_MINUTES=120
FRONTEND_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
```

### Vercel frontend

1. Create a Vercel project from the GitHub repository.
2. Set the root directory to:

```text
web
```

3. Add:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

4. Redeploy Render after setting `FRONTEND_ORIGINS` to the final Vercel URL.

## Backup and Recovery

The project includes GitHub Actions automation for database backups.

### Automated backup

Workflow file:

```text
.github/workflows/mysql-backup.yml
```

The workflow runs every day at `23:00` Vietnam time (`16:00` UTC):

```yaml
on:
  schedule:
    - cron: "0 16 * * *"
  workflow_dispatch:
```

`workflow_dispatch` allows manual testing from:

```text
GitHub -> Actions -> MySQL Backup -> Run workflow
```

### Required GitHub Secrets

Create these as separate repository secrets:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

Do not put `DB_HOST=value` into one secret. In GitHub Secrets UI:

```text
Name:   DB_HOST
Secret: RAILWAY_TCP_PROXY_DOMAIN
```

The same pattern applies to `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.

### Where backups are stored

Backups are not committed into the repository. They are uploaded as GitHub Actions artifacts:

```text
GitHub -> Actions -> MySQL Backup -> select a run -> Artifacts
```

Artifact retention is set to 7 days. Backup files may contain sensitive data, so they should not be committed to GitHub.

### Recovery

Download and extract a backup artifact, set local database environment variables, then run:

```powershell
.\database\backup\restore_mysql.ps1 -BackupFile ".\backups\recruitment_mysql_backup_YYYYMMDD_HHMMSS_utc.sql.gz"
```

The restore script asks for confirmation before importing:

```text
Type RESTORE to continue
```

Recovery is manual by design because it can overwrite current production data.

### Disable backup automation

After the project, disable it by one of these methods:

- Delete `.github/workflows/mysql-backup.yml` and push the deletion.
- Disable the workflow from the GitHub Actions page.
- Remove the database secrets from repository settings.

## Security Notes

- Never commit `.env`, `.env.local`, database passwords, Railway credentials, or backup files.
- Backup files can contain email addresses, password hashes, candidate profiles, employer details, interview notes, notifications, and audit logs.
- `database/05_security.sql` is not part of the recommended Railway import flow because managed cloud MySQL services often restrict role and privilege statements.
- The frontend is not a security boundary. All sensitive checks are enforced by the backend.


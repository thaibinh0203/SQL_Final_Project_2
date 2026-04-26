# Recruitment Management System

This project contains a MySQL schema, SQL advanced objects, a SQLAlchemy backend, and a Streamlit frontend for employer and candidate workflows.

## Setup

1. Create and load the database scripts in this order:
   - `database/init.sql`
   - `database/seed_510.sql`
   - `database/02_views.sql`
   - `database/03_routines.sql`
   - `database/04_triggers.sql`
   - `database/05_security.sql`
   - `database/cloud_06_admin_security_audit.sql`
2. Create a local `.env` file from `.env.example`.
3. Install Python dependencies:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Environment Variables

Example `.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=recruitment_management_system
DB_ECHO=false
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXP_MINUTES=120
```

## Run Backend Smoke Test

```powershell
python -m backend.smoke_test
```

This verifies:
- database connection
- employer login
- candidate login
- dashboard query access
- open job listing access
- candidate application/interview access

## Run Streamlit App

```powershell
streamlit run frontend/app.py
```

## Demo Login

- Employer email example: `employer0001@example.com`
- Candidate email example: `candidate0001@example.com`
- Admin email example: `admin@example.com`
- Password for all demo logins: `1`

After importing `database/cloud_06_admin_security_audit.sql`, sign in as admin and reset the demo admin password before using a public deployment.

## Web Functionalities

- Authentication:
  - Sign in with employer or candidate accounts
  - Sign in with admin accounts
  - Register a new candidate account
  - Register a new employer account; new employers require admin approval before normal sign-in
  - JWT-backed sessions with backend role checks for Employer, Candidate, and Admin
  - Change password from the account security section

- Employer dashboard:
  - View company-level metrics such as total jobs, open jobs, applications, interviews, pass/fail counts, and average interview score
  - View recent applications in a dashboard activity table
  - View hiring trend charts for applications by position, scheduled interviews by month, and pass rate
  - Navigate quickly to job management from the dashboard

- Employer job management:
  - Create new job positions
  - Update job status between `Open` and `Closed`
  - View all owned positions
  - Inspect a job snapshot showing applicant count, pass/fail/pending interview counts, average score, and current job status
  - View per-position interview outcome ratios

- Employer application management:
  - View all applications for the employer's own job positions
  - Filter applications by status
  - Search applications by candidate, company, or position
  - Move applications from `Pending` to `Reviewed` or `Rejected` without scheduling an interview
  - View applications ready for interview scheduling
  - View shortlisted candidates
  - Expand and inspect detailed applicant profiles, including personal details, resume link, application status, and interview information when available

- Employer interview management:
  - View new applicants who do not yet have an interview scheduled
  - Schedule interviews for valid applications
  - Record interview results with pass, fail, pending, score, and notes
  - View full interview history with candidate, application, score, result, location/link, and interview date

- Employer performance analytics:
  - View application summaries by job position
  - Rank positions by application volume, accepted count, interviewing count, or average interview score
  - Visualize interview outcome distributions with chart-based summaries
  - Review company-wide hiring outcome ratios

- Candidate job board:
  - Browse all open job positions
  - Open a dedicated job detail panel with description, requirements, company name, and apply action
  - Search open jobs by title, company, description, or requirements
  - Apply directly to eligible open positions

- Candidate application tracking:
  - View all submitted applications
  - Track current application status for each submission
  - View company, position, and application date in a structured activity table

- Candidate interview tracking:
  - View all scheduled interviews
  - View upcoming interviews separately
  - Review interview date, company, result, and related application information

- Candidate profile management:
  - Update full name, phone number, resume URL, and optional date of birth
  - Upload a CV file to the backend instead of only using an external resume URL
  - Manage account password from the profile section

- Admin workspace:
  - View all employers, candidates, jobs, applications, interviews, audit logs, and data quality signals
  - Approve, reject, or move employer accounts back to pending review
  - Enable or disable accounts and reset account passwords
  - Review system metrics for total users, jobs, applications, interviews, and pass rate
  - Review data quality checks for duplicate candidates, suspicious jobs, and invalid employer records

- Operational safeguards:
  - Backend reads the authenticated user from the JWT token and validates route ownership before data access
  - Login endpoint uses an in-memory rate limit to reduce brute-force attempts
  - Audit logs record important actions such as job creation, status changes, scheduling, and interview result recording
  - Candidate notifications are created when an interview is scheduled or a result is recorded
  - Frontend asks for confirmation before closing jobs, rejecting applications, and recording pass/fail results

## Current Structure

- `backend/config.py`: environment-backed runtime settings
- `backend/db.py`: engine and session management
- `backend/models.py`: SQLAlchemy 2.0 ORM models
- `backend/crud.py`: all database access and workflow functions
- `backend/smoke_test.py`: minimal backend verification
- `frontend/app.py`: Streamlit entrypoint and top-level routing
- `frontend/session.py`: auth/session-state helpers
- `frontend/components.py`: shared layout, table, and metric helpers
- `frontend/pages/auth.py`: login page
- `frontend/pages/employer.py`: employer screens
- `frontend/pages/candidate.py`: candidate screens
- `database/`: schema, seed, views, routines, triggers, and security scripts

## Web Deployment Architecture

For cloud deployment, the recommended architecture is:

- `Railway MySQL` as the managed relational database
- `Render` as the globally accessible backend API host
- `Vercel` as the modern Next.js frontend host
- `Streamlit Community Cloud` as the legacy dashboard host if you still want to keep it available

This separation is appropriate for academic and demonstration purposes because it preserves the current project stack while assigning one clear responsibility to each platform:

- the database layer remains compatible with the MySQL-specific schema, views, routines, and triggers
- the backend layer exposes HTTP endpoints through FastAPI for both read models and workflow routines
- the frontend layer can be deployed independently as a polished React/Next.js web app

The project already includes deployment-oriented files:

- `backend/api.py`: FastAPI entrypoint for Render deployment
- `render.yaml`: Render service definition
- `web/`: Next.js frontend using Tailwind CSS, shadcn-style UI components, Recharts, and TanStack Table
- `streamlit_app.py`: root Streamlit entrypoint for Community Cloud
- `.streamlit/secrets.toml.example`: secrets template for Streamlit Cloud
- `Dockerfile`: backend FastAPI container for Railway Docker deployment
- `railway.toml`: Railway Docker build and health-check config
- `database/cloud_01_schema.sql`
- `database/cloud_00_reset.sql`
- `database/cloud_seed_510.sql`
- `database/cloud_02_views.sql`
- `database/cloud_03_routines.sql`
- `database/cloud_04_triggers.sql`
- `database/cloud_06_admin_security_audit.sql`
- `database/CLOUD_IMPORT_ORDER.md`

## Railway MySQL Deployment

### Objective

The purpose of Railway in this architecture is to host the production database externally so that both Render and Streamlit Community Cloud can connect to the same shared dataset.

### Procedure

1. Create a new project on Railway.
2. Add a `MySQL` database service.
3. Open the service variables and record the following values:
   - `MYSQLHOST`
   - `MYSQLPORT`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`
4. Use the public TCP proxy values, not the private internal hostname, when connecting from your own computer:
   - `RAILWAY_TCP_PROXY_DOMAIN`
   - `RAILWAY_TCP_PROXY_PORT`
5. Connect to the Railway database using MySQL Workbench or another MySQL client.
6. Select the target schema, usually `railway`.
7. If you do not need the current data, run the destructive reset first:
   - `database/cloud_00_reset.sql`
8. Import the SQL files in this order:
   - `database/cloud_01_schema.sql`
   - `database/cloud_seed_510.sql`
   - `database/cloud_02_views.sql`
   - `database/cloud_03_routines.sql`
   - `database/cloud_04_triggers.sql`
   - `database/cloud_06_admin_security_audit.sql`

### Verification

After import, verify that the base tables contain data:

```sql
SELECT COUNT(*) FROM Accounts;
SELECT COUNT(*) FROM Employers;
SELECT COUNT(*) FROM Candidates;
SELECT COUNT(*) FROM JobPositions;
SELECT COUNT(*) FROM Applications;
SELECT COUNT(*) FROM Interviews;
```

### Important Note

`database/05_security.sql` is intentionally not part of the recommended Railway import workflow. Managed cloud MySQL environments often restrict role and privilege operations, and these statements are not required for the current application deployment.

## Railway Docker Backend Deployment

### Objective

Use the root `Dockerfile` when you want Railway to build and run the FastAPI backend as a Docker service. This replaces the Render backend deployment for the API layer.

### Procedure

1. Push the repository to GitHub.
2. In Railway, create a new service from the GitHub repository.
3. Railway should detect the root `Dockerfile` and `railway.toml`.
4. Add these backend environment variables:

```env
DB_HOST=YOUR_RAILWAY_MYSQL_HOST_OR_TCP_PROXY_DOMAIN
DB_PORT=YOUR_RAILWAY_MYSQL_PORT_OR_TCP_PROXY_PORT
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=YOUR_MYSQL_DATABASE
DB_ECHO=false
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXP_MINUTES=120
FRONTEND_ORIGINS=http://localhost:3000,https://your-frontend-domain
```

5. Deploy and verify:

```text
https://your-railway-api-domain/health
https://your-railway-api-domain/docs
```

### Optional MySQL Docker Image

`database/Dockerfile.mysql` can build a fresh seeded MySQL image from the cloud SQL files. Use this only for demos or experiments, and mount a Railway volume at `/var/lib/mysql` if you want the data to survive redeploys. For normal use, the Railway managed MySQL service is safer and easier to operate.

## Render Backend Deployment

### Objective

The purpose of Render in this project is to publish the backend as a globally reachable HTTP service. This enables external validation of backend availability and provides a foundation for future frontend-to-API integration.

### Procedure

1. Push the repository to GitHub.
2. In Render, create a new `Web Service`.
3. Connect the GitHub repository.
4. Use the following runtime configuration:

- Build Command:

```bash
pip install -r requirements.txt
```

- Start Command:

```bash
uvicorn backend.api:app --host 0.0.0.0 --port $PORT
```

- Health Check Path:

```text
/health
```

5. Add the following environment variables in Render:

```env
DB_HOST=YOUR_RAILWAY_TCP_PROXY_DOMAIN
DB_PORT=YOUR_RAILWAY_TCP_PROXY_PORT
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=YOUR_MYSQL_DATABASE
DB_ECHO=false
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXP_MINUTES=120
```

The included `render.yaml` file already expresses this deployment model and may be used directly.

### Verification

After deployment, the following endpoints should be reachable:

- `/`
- `/health`
- `/docs`
- `/smoke-test`
- `/auth/login`
- `/jobs/open`

Example:

```text
https://your-render-service.onrender.com/health
```

Set `FRONTEND_ORIGINS` on Render after the Vercel frontend is created:

```env
FRONTEND_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
```

## Next.js Frontend Deployment

### Objective

The `web/` directory contains the modern frontend intended for Vercel. It calls the Render backend through REST, while the backend continues to use the MySQL views, functions, stored procedures, and triggers behind the API routes.

### Local Development

```powershell
cd web
npm install
npm run dev
```

Create `web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

### Vercel Deployment

1. Push the repository to GitHub.
2. Create a new Vercel project from the repository.
3. Set the Vercel root directory to:

```text
web
```

4. Add the frontend environment variable:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

5. Redeploy the Render backend after setting `FRONTEND_ORIGINS` to the final Vercel URL.

## Streamlit Community Cloud Deployment

### Objective

The Streamlit app is now optional. Keep it as a legacy dashboard if you still want the original interface available.

### Procedure

1. Open Streamlit Community Cloud.
2. Create a new app from the GitHub repository.
3. Set the main app file to:

```text
streamlit_app.py
```

4. In the app settings, add secrets using the format from `.streamlit/secrets.toml.example`:

```toml
DB_HOST = "YOUR_RAILWAY_TCP_PROXY_DOMAIN"
DB_PORT = "YOUR_RAILWAY_TCP_PROXY_PORT"
DB_USER = "YOUR_MYSQL_USER"
DB_PASSWORD = "YOUR_MYSQL_PASSWORD"
DB_NAME = "YOUR_MYSQL_DATABASE"
DB_ECHO = "false"
API_BASE_URL = "https://your-render-service.onrender.com"
```

### Verification

Once deployed, verify that:

- the login page loads successfully
- employer accounts can open the employer workspace
- candidate accounts can open the candidate workspace
- seeded demo accounts still authenticate correctly

## Local-to-Cloud Configuration Mapping

The same database configuration pattern is used across local and cloud environments. The only difference is the host and port values.

### Local Example

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_LOCAL_PASSWORD
DB_NAME=recruitment_management_system
DB_ECHO=false
```

### Railway/Cloud Example

```env
DB_HOST=YOUR_RAILWAY_TCP_PROXY_DOMAIN
DB_PORT=YOUR_RAILWAY_TCP_PROXY_PORT
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=YOUR_MYSQL_DATABASE
DB_ECHO=false
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXP_MINUTES=120
```

## Suggested Deployment Order

For stability, deploy in the following sequence:

1. Provision Railway MySQL.
2. If resetting an existing Railway database, run `database/cloud_00_reset.sql`.
3. Import schema, seed data, views, routines, triggers, and `cloud_06_admin_security_audit.sql`.
4. Deploy the backend on Render or Railway Docker and verify `/health`.
5. Deploy the Next.js frontend and set `NEXT_PUBLIC_API_BASE_URL` to the backend URL.

This order is recommended because both application layers depend on a valid, preloaded database before they can function correctly.

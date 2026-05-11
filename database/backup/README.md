# Database Backup and Recovery

This folder documents the backup and recovery workflow for the Railway MySQL database used by the Recruitment Management System.

## Automated Backup with GitHub Actions

The workflow file is:

```text
.github/workflows/mysql-backup.yml
```

It runs automatically every day at `23:00` Vietnam time (`16:00` UTC). It can also be started manually from the GitHub Actions tab because the workflow includes `workflow_dispatch`.

The workflow exports the database with `mysqldump`, includes stored procedures, functions, and triggers, compresses the dump as `.sql.gz`, and uploads it as a GitHub Actions artifact. The artifact is retained for 7 days.

## Required GitHub Secrets

Configure these repository secrets in:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Required secrets:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

For Railway MySQL, use the public TCP proxy values when the workflow runs from GitHub:

```text
DB_HOST = RAILWAY_TCP_PROXY_DOMAIN
DB_PORT = RAILWAY_TCP_PROXY_PORT
DB_USER = MYSQLUSER
DB_PASSWORD = MYSQLPASSWORD
DB_NAME = MYSQLDATABASE
```

## Downloading a Backup

1. Open the GitHub repository.
2. Go to `Actions`.
3. Open the latest `MySQL Backup` workflow run.
4. Download the `mysql-backup-...` artifact.
5. Extract the artifact ZIP file.
6. The backup file will be a compressed SQL dump, for example:

```text
recruitment_mysql_backup_20260511_160000_utc.sql.gz
```

## Recovery / Restore

Recovery is intentionally manual because restoring a backup overwrites current database state. This avoids accidental production data loss.

Use the PowerShell restore script:

```powershell
.\database\backup\restore_mysql.ps1 -BackupFile ".\backups\recruitment_mysql_backup_20260511_160000_utc.sql.gz"
```

The script reads these environment variables:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

Example local PowerShell setup:

```powershell
$env:DB_HOST="YOUR_RAILWAY_TCP_PROXY_DOMAIN"
$env:DB_PORT="YOUR_RAILWAY_TCP_PROXY_PORT"
$env:DB_USER="YOUR_MYSQL_USER"
$env:DB_PASSWORD="YOUR_MYSQL_PASSWORD"
$env:DB_NAME="YOUR_MYSQL_DATABASE"
```

Then run the restore command:

```powershell
.\database\backup\restore_mysql.ps1 -BackupFile ".\backups\recruitment_mysql_backup_20260511_160000_utc.sql.gz"
```

The script asks for confirmation before importing the backup.

## Security Notes

- Backup files may contain user emails, password hashes, candidate profiles, employer data, interview notes, notifications, and audit logs.
- Do not commit backup files to GitHub.
- Do not print database secrets in workflow logs.
- Keep artifact retention short for academic/demo projects. This workflow uses 7 days.
- For production, upload encrypted backups to a dedicated storage service instead of keeping them only as GitHub Actions artifacts.

## Disabling the Automation

To stop automated backups after the project:

1. Delete `.github/workflows/mysql-backup.yml` and push the deletion, or
2. Disable the workflow from `GitHub -> Actions -> MySQL Backup -> Disable workflow`, or
3. Remove the database secrets from GitHub repository settings.

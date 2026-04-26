Cloud import order for managed MySQL services such as Railway:

0. Optional destructive reset: `cloud_00_reset.sql`
1. `cloud_01_schema.sql`
2. `cloud_seed_510.sql`
3. `cloud_02_views.sql`
4. `cloud_03_routines.sql`
5. `cloud_04_triggers.sql`
6. `cloud_06_admin_security_audit.sql`

Notes:
- These files intentionally remove `CREATE DATABASE` and `USE recruitment_management_system;`.
- Connect directly to the target database before running them.
- Run `cloud_00_reset.sql` only when you are intentionally deleting the current Railway data.
- `05_security.sql` is usually not needed on managed cloud MySQL and may fail depending on provider permissions.
- `cloud_06_admin_security_audit.sql` adds JWT/RBAC support tables, admin account seed data, audit logs, notifications, and admin metrics.

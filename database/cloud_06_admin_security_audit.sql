ALTER TABLE Accounts
    MODIFY Role ENUM('Employer', 'Candidate', 'Admin') NOT NULL;

SET @account_status_exists := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'Accounts'
      AND column_name = 'AccountStatus'
);

SET @account_status_sql := IF(
    @account_status_exists = 0,
    'ALTER TABLE Accounts ADD COLUMN AccountStatus ENUM(''Active'', ''Disabled'') NOT NULL DEFAULT ''Active''',
    'DO 0'
);
PREPARE account_status_stmt FROM @account_status_sql;
EXECUTE account_status_stmt;
DEALLOCATE PREPARE account_status_stmt;

SET @approval_status_exists := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'Employers'
      AND column_name = 'ApprovalStatus'
);

SET @approval_status_sql := IF(
    @approval_status_exists = 0,
    'ALTER TABLE Employers ADD COLUMN ApprovalStatus ENUM(''Pending'', ''Approved'', ''Rejected'') NOT NULL DEFAULT ''Approved''',
    'DO 0'
);
PREPARE approval_status_stmt FROM @approval_status_sql;
EXECUTE approval_status_stmt;
DEALLOCATE PREPARE approval_status_stmt;

INSERT INTO Accounts (Email, PasswordHash, Role, AccountStatus)
SELECT 'admin@example.com', 'sha256$admin-demo', 'Admin', 'Active'
WHERE NOT EXISTS (
    SELECT 1 FROM Accounts WHERE Email = 'admin@example.com'
);

CREATE OR REPLACE VIEW vw_admin_system_metrics AS
SELECT
    (SELECT COUNT(*) FROM Accounts) AS TotalUsers,
    (SELECT COUNT(*) FROM Employers) AS TotalEmployers,
    (SELECT COUNT(*) FROM Candidates) AS TotalCandidates,
    (SELECT COUNT(*) FROM JobPositions) AS TotalJobs,
    (SELECT COUNT(*) FROM Applications) AS TotalApplications,
    (SELECT COUNT(*) FROM Interviews) AS TotalInterviews,
    (
        SELECT CASE
            WHEN COUNT(*) = 0 THEN 0.00
            ELSE ROUND((SUM(CASE WHEN Result = 'Pass' THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2)
        END
        FROM Interviews
    ) AS PassRate;

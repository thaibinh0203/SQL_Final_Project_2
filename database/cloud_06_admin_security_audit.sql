ALTER TABLE Accounts
    MODIFY Role ENUM('Employer', 'Candidate', 'Admin') NOT NULL;

ALTER TABLE Accounts
    ADD COLUMN AccountStatus ENUM('Active', 'Disabled') NOT NULL DEFAULT 'Active';

ALTER TABLE Employers
    ADD COLUMN ApprovalStatus ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Approved';

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

ALTER TABLE Accounts
    MODIFY Role ENUM('Employer', 'Candidate', 'Admin') NOT NULL;

ALTER TABLE Accounts
    ADD COLUMN AccountStatus ENUM('Active', 'Disabled') NOT NULL DEFAULT 'Active';

ALTER TABLE Employers
    ADD COLUMN ApprovalStatus ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Approved';

CREATE TABLE IF NOT EXISTS AuditLogs (
    AuditLogID INT AUTO_INCREMENT PRIMARY KEY,
    ActorAccountID INT NULL,
    ActorRole VARCHAR(20) NULL,
    Action VARCHAR(80) NOT NULL,
    EntityType VARCHAR(80) NOT NULL,
    EntityID INT NULL,
    Details TEXT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auditlogs_actor
        FOREIGN KEY (ActorAccountID) REFERENCES Accounts (AccountID)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS Notifications (
    NotificationID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID INT NOT NULL,
    Title VARCHAR(160) NOT NULL,
    Message TEXT NOT NULL,
    IsRead BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_account
        FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

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

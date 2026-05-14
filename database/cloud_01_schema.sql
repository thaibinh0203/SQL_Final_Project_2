

CREATE TABLE Accounts (
    AccountID INT AUTO_INCREMENT PRIMARY KEY,
    Email VARCHAR(150) NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('Employer', 'Candidate') NOT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_accounts_email UNIQUE (Email)
);

CREATE TABLE Employers (
    EmployerID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID INT NOT NULL,
    CompanyName VARCHAR(120) NOT NULL,
    ContactNumber VARCHAR(20) NULL,
    Address TEXT NULL,
    Description TEXT NULL,
    CONSTRAINT uq_employers_account UNIQUE (AccountID),
    CONSTRAINT fk_employers_account
        FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE Candidates (
    CandidateID INT AUTO_INCREMENT PRIMARY KEY,
    AccountID INT NOT NULL,
    FullName VARCHAR(120) NOT NULL,
    DateOfBirth DATE NULL,
    PhoneNumber VARCHAR(20) NULL,
    ResumeURL VARCHAR(255) NULL,
    CONSTRAINT uq_candidates_account UNIQUE (AccountID),
    CONSTRAINT fk_candidates_account
        FOREIGN KEY (AccountID) REFERENCES Accounts (AccountID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE JobPositions (
    PositionID INT AUTO_INCREMENT PRIMARY KEY,
    EmployerID INT NOT NULL,
    Title VARCHAR(120) NOT NULL,
    JobDescription TEXT NOT NULL,
    Requirements TEXT NULL,
    Status ENUM('Open', 'Closed') NOT NULL DEFAULT 'Open',
    PostedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_jobpositions_employer
        FOREIGN KEY (EmployerID) REFERENCES Employers (EmployerID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE Applications (
    ApplicationID INT AUTO_INCREMENT PRIMARY KEY,
    CandidateID INT NOT NULL,
    PositionID INT NOT NULL,
    ApplicationDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Status ENUM('Pending', 'Reviewed', 'Interviewing', 'Rejected', 'Accepted')
        NOT NULL DEFAULT 'Pending',
    CONSTRAINT uq_applications_candidate_position UNIQUE (CandidateID, PositionID),
    CONSTRAINT fk_applications_candidate
        FOREIGN KEY (CandidateID) REFERENCES Candidates (CandidateID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_applications_position
        FOREIGN KEY (PositionID) REFERENCES JobPositions (PositionID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE Interviews (
    InterviewID INT AUTO_INCREMENT PRIMARY KEY,
    ApplicationID INT NOT NULL,
    InterviewDate DATETIME NOT NULL,
    LocationOrLink VARCHAR(255) NULL,
    Result ENUM('Pending', 'Pass', 'Fail') NOT NULL DEFAULT 'Pending',
    Score DECIMAL(5,2) NULL,
    Notes TEXT NULL,
    CONSTRAINT uq_interviews_application UNIQUE (ApplicationID),
    CONSTRAINT chk_interviews_score
        CHECK (Score IS NULL OR (Score >= 0 AND Score <= 10)),
    CONSTRAINT fk_interviews_application
        FOREIGN KEY (ApplicationID) REFERENCES Applications (ApplicationID)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE AuditLogs (
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

CREATE TABLE Notifications (
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

CREATE INDEX idx_jobpositions_status
    ON JobPositions (Status);

CREATE INDEX idx_applications_status
    ON Applications (Status);

CREATE INDEX idx_interviews_date
    ON Interviews (InterviewDate);

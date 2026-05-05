USE recruitment_management_system;

CREATE OR REPLACE VIEW vw_open_job_positions AS
SELECT
    jp.PositionID,
    jp.EmployerID,
    e.CompanyName,
    jp.Title,
    jp.JobDescription,
    jp.Requirements,
    jp.Status,
    jp.PostedDate
FROM JobPositions AS jp
INNER JOIN Employers AS e
    ON e.EmployerID = jp.EmployerID
WHERE jp.Status = 'Open';


CREATE OR REPLACE VIEW vw_candidate_application_tracker AS
SELECT
    a.ApplicationID,
    a.CandidateID,
    c.FullName AS CandidateName,
    a.PositionID,
    jp.Title AS PositionTitle,
    jp.EmployerID,
    e.CompanyName,
    a.ApplicationDate,
    a.Status AS ApplicationStatus,
    i.InterviewDate,
    i.LocationOrLink,
    i.Result AS InterviewResult,
    i.Score AS InterviewScore,
    i.Notes
FROM Applications AS a
INNER JOIN Candidates AS c
    ON c.CandidateID = a.CandidateID
INNER JOIN JobPositions AS jp
    ON jp.PositionID = a.PositionID
INNER JOIN Employers AS e
    ON e.EmployerID = jp.EmployerID
LEFT JOIN Interviews AS i
    ON i.ApplicationID = a.ApplicationID;


CREATE OR REPLACE VIEW vw_shortlisted_candidates AS
SELECT
    a.ApplicationID,
    c.CandidateID,
    c.FullName AS CandidateName,
    c.PhoneNumber,
    c.ResumeURL,
    jp.PositionID,
    jp.Title AS PositionTitle,
    e.EmployerID,
    e.CompanyName,
    a.Status AS ApplicationStatus,
    i.InterviewDate,
    i.Result AS InterviewResult,
    i.Score AS InterviewScore
FROM Applications AS a
INNER JOIN Candidates AS c
    ON c.CandidateID = a.CandidateID
INNER JOIN JobPositions AS jp
    ON jp.PositionID = a.PositionID
INNER JOIN Employers AS e
    ON e.EmployerID = jp.EmployerID
LEFT JOIN Interviews AS i
    ON i.ApplicationID = a.ApplicationID
WHERE a.Status IN ('Interviewing', 'Accepted');


CREATE OR REPLACE VIEW vw_job_application_summary AS
SELECT
    jp.PositionID,
    jp.EmployerID,
    e.CompanyName,
    jp.Title AS PositionTitle,
    jp.Status AS PositionStatus,
    jp.PostedDate,
    COUNT(a.ApplicationID) AS TotalApplications,
    COALESCE(SUM(CASE WHEN a.Status = 'Pending' THEN 1 ELSE 0 END), 0) AS PendingApplications,
    COALESCE(SUM(CASE WHEN a.Status = 'Reviewed' THEN 1 ELSE 0 END), 0) AS ReviewedApplications,
    COALESCE(SUM(CASE WHEN a.Status = 'Interviewing' THEN 1 ELSE 0 END), 0) AS InterviewingApplications,
    COALESCE(SUM(CASE WHEN a.Status = 'Rejected' THEN 1 ELSE 0 END), 0) AS RejectedApplications,
    COALESCE(SUM(CASE WHEN a.Status = 'Accepted' THEN 1 ELSE 0 END), 0) AS AcceptedApplications,
    MAX(a.ApplicationDate) AS LatestApplicationDate,
    COALESCE(ROUND(AVG(i.Score), 2), 0.00) AS AverageInterviewScore
FROM JobPositions AS jp
INNER JOIN Employers AS e
    ON e.EmployerID = jp.EmployerID
LEFT JOIN Applications AS a
    ON a.PositionID = jp.PositionID
LEFT JOIN Interviews AS i
    ON i.ApplicationID = a.ApplicationID
GROUP BY
    jp.PositionID,
    jp.EmployerID,
    e.CompanyName,
    jp.Title,
    jp.Status,
    jp.PostedDate;


CREATE OR REPLACE VIEW vw_interview_results AS
SELECT
    i.InterviewID,
    i.ApplicationID,
    i.InterviewDate,
    i.LocationOrLink,
    i.Result,
    i.Score,
    i.Notes,
    a.Status AS ApplicationStatus,
    a.ApplicationDate,
    c.CandidateID,
    c.FullName AS CandidateName,
    jp.PositionID,
    jp.Title AS PositionTitle,
    e.EmployerID,
    e.CompanyName
FROM Interviews AS i
INNER JOIN Applications AS a
    ON a.ApplicationID = i.ApplicationID
INNER JOIN Candidates AS c
    ON c.CandidateID = a.CandidateID
INNER JOIN JobPositions AS jp
    ON jp.PositionID = a.PositionID
INNER JOIN Employers AS e
    ON e.EmployerID = jp.EmployerID;


CREATE OR REPLACE VIEW vw_employer_dashboard_metrics AS
SELECT
    e.EmployerID,
    e.CompanyName,
    (
        SELECT COUNT(*)
        FROM JobPositions AS jp
        WHERE jp.EmployerID = e.EmployerID
    ) AS TotalPositions,
    (
        SELECT COUNT(*)
        FROM JobPositions AS jp
        WHERE jp.EmployerID = e.EmployerID
          AND jp.Status = 'Open'
    ) AS OpenPositions,
    (
        SELECT COUNT(*)
        FROM Applications AS a
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
    ) AS TotalApplications,
    (
        SELECT COUNT(*)
        FROM Applications AS a
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND a.Status = 'Interviewing'
    ) AS InterviewingApplications,
    (
        SELECT COUNT(*)
        FROM Applications AS a
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND a.Status = 'Accepted'
    ) AS AcceptedApplications,
    (
        SELECT COUNT(*)
        FROM Applications AS a
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND a.Status = 'Rejected'
    ) AS RejectedApplications,
    (
        SELECT COUNT(*)
        FROM Interviews AS i
        INNER JOIN Applications AS a
            ON a.ApplicationID = i.ApplicationID
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
    ) AS TotalInterviews,
    (
        SELECT COUNT(*)
        FROM Interviews AS i
        INNER JOIN Applications AS a
            ON a.ApplicationID = i.ApplicationID
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND i.Result = 'Pass'
    ) AS PassedInterviews,
    (
        SELECT COUNT(*)
        FROM Interviews AS i
        INNER JOIN Applications AS a
            ON a.ApplicationID = i.ApplicationID
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND i.Result = 'Fail'
    ) AS FailedInterviews,
    (
        SELECT ROUND(COALESCE(AVG(i.Score), 0), 2)
        FROM Interviews AS i
        INNER JOIN Applications AS a
            ON a.ApplicationID = i.ApplicationID
        INNER JOIN JobPositions AS jp
            ON jp.PositionID = a.PositionID
        WHERE jp.EmployerID = e.EmployerID
          AND i.Score IS NOT NULL
    ) AS AverageInterviewScore
FROM Employers AS e;

SET FOREIGN_KEY_CHECKS = 0;

DROP TRIGGER IF EXISTS trg_interviews_after_insert_status;
DROP TRIGGER IF EXISTS trg_interviews_after_update_status;

DROP VIEW IF EXISTS vw_admin_system_metrics;
DROP VIEW IF EXISTS vw_employer_dashboard_metrics;
DROP VIEW IF EXISTS vw_interview_results;
DROP VIEW IF EXISTS vw_job_application_summary;
DROP VIEW IF EXISTS vw_shortlisted_candidates;
DROP VIEW IF EXISTS vw_candidate_application_tracker;
DROP VIEW IF EXISTS vw_open_job_positions;

DROP FUNCTION IF EXISTS fn_application_count_by_position;
DROP FUNCTION IF EXISTS fn_candidate_application_count;
DROP FUNCTION IF EXISTS fn_employer_pass_rate;
DROP FUNCTION IF EXISTS fn_average_interview_score;

DROP PROCEDURE IF EXISTS sp_create_job_position;
DROP PROCEDURE IF EXISTS sp_update_job_status;
DROP PROCEDURE IF EXISTS sp_submit_application;
DROP PROCEDURE IF EXISTS sp_schedule_interview;
DROP PROCEDURE IF EXISTS sp_record_interview_result;

DROP TABLE IF EXISTS Notifications;
DROP TABLE IF EXISTS AuditLogs;
DROP TABLE IF EXISTS Interviews;
DROP TABLE IF EXISTS Applications;
DROP TABLE IF EXISTS JobPositions;
DROP TABLE IF EXISTS Candidates;
DROP TABLE IF EXISTS Employers;
DROP TABLE IF EXISTS Accounts;

SET FOREIGN_KEY_CHECKS = 1;

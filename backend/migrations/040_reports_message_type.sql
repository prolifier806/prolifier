-- Migration 040 — Add "message" to reports.target_type check constraint
--
-- The reports table was updated to support generic target_type values, but
-- "message" was not included in the check constraint. Group-message reports
-- send target_type = "message" which violates the constraint.

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_target_type_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post', 'collab', 'comment', 'user', 'group', 'message'));

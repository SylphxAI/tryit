-- Validation scans existing rows without blocking ordinary writes. Only after
-- it succeeds do we briefly take an exclusive lock to replace the old CHECK.
SET LOCAL lock_timeout = '2s';

ALTER TABLE funnel_events VALIDATE CONSTRAINT funnel_events_event_check_widened;
ALTER TABLE funnel_events DROP CONSTRAINT funnel_events_event_check;
ALTER TABLE funnel_events RENAME CONSTRAINT funnel_events_event_check_widened TO funnel_events_event_check;

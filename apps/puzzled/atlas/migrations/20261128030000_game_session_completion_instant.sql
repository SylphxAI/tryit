-- NULL means no trustworthy instant was recorded; never infer it from completed_at.
SET LOCAL lock_timeout = '2s';

ALTER TABLE game_sessions ADD COLUMN completed_at_utc TIMESTAMPTZ;

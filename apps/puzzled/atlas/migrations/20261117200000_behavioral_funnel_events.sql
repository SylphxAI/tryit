-- Metadata-only expansion: the previous CHECK already covered every existing
-- event. The widened NOT VALID CHECK still enforces writes, without rescanning
-- legacy rows; the nullable column has no default or backfill.
ALTER TABLE funnel_events
    ADD COLUMN IF NOT EXISTS params jsonb,
    DROP CONSTRAINT funnel_events_event_check,
    ADD CONSTRAINT funnel_events_event_check CHECK (event IN (
        'landing', 'game_start', 'signup', 'web_vitals', 'share_landing',
        'game_complete', 'game_abandon', 'hint_used', 'share_clicked', 'paywall_hit',
        'pwa_install_prompted', 'pwa_installed', 'push_opted_in'
    )) NOT VALID;

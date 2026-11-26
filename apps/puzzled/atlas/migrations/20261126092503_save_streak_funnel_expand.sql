-- Keep the old CHECK until the widened one can be validated in its own file.
-- Adding a NOT VALID CHECK takes a brief exclusive lock, but skips the scan.
SET LOCAL lock_timeout = '2s';

ALTER TABLE funnel_events
    ADD CONSTRAINT funnel_events_event_check_widened CHECK (event IN (
        'landing', 'game_start', 'signup', 'web_vitals', 'share_landing',
        'game_complete', 'game_abandon', 'hint_used', 'share_clicked', 'paywall_hit',
        'pwa_install_prompted', 'pwa_installed', 'push_opted_in',
        'save_streak_prompted', 'save_streak_clicked'
    )) NOT VALID;

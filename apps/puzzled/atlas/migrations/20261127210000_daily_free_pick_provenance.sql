-- Point-in-time start provenance, written only with each new free pick.
-- NULL means claimed before collection (not collected); nothing is backfilled.
-- Nullable columns without defaults are metadata-only; the CHECK skips the scan.
SET LOCAL lock_timeout = '2s';

ALTER TABLE daily_free_picks
    ADD COLUMN claimed_via text,
    ADD COLUMN guest_entry boolean,
    ADD COLUMN comparison_excluded boolean;

ALTER TABLE daily_free_picks
    ADD CONSTRAINT daily_free_picks_claimed_via_check
    CHECK (claimed_via IN ('start', 'guess', 'finish')) NOT VALID;

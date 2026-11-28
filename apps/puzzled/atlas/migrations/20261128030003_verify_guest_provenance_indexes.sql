-- A failed concurrent build may leave an INVALID index. IF NOT EXISTS does
-- not repair it. If the assertion fails, have the migration owner DROP INDEX
-- CONCURRENTLY for the named invalid index and rebuild it with the original
-- CREATE INDEX CONCURRENTLY, outside a transaction, before retrying this gate.
DO $guard$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('public.game_sessions_adopted_from_guest_idx')
          AND indrelid = 'public.game_sessions'::regclass AND indisvalid
    ) THEN
        RAISE EXCEPTION 'Missing or invalid index: public.game_sessions_adopted_from_guest_idx';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('public.result_shares_adopted_from_guest_idx')
          AND indrelid = 'public.result_shares'::regclass AND indisvalid
    ) THEN
        RAISE EXCEPTION 'Missing or invalid index: public.result_shares_adopted_from_guest_idx';
    END IF;
END
$guard$;

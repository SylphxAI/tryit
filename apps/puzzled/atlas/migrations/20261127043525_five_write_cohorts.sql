-- Register a stored Five puzzle as a new cohort while closed. No seed rows.
-- The immutable registration is also the one-time admission receipt.
SET LOCAL lock_timeout = '2s';

CREATE TABLE five_write_cohorts (
    day_key date NOT NULL,
    cohort text NOT NULL CHECK (cohort = 'durable-v1'),
    puzzle_id uuid NOT NULL UNIQUE REFERENCES daily_puzzles(id),
    admitted_by text,
    admitted_at timestamptz,
    PRIMARY KEY (day_key, cohort),
    CHECK ((admitted_by IS NULL AND admitted_at IS NULL) OR
           (admitted_by IS NOT NULL AND btrim(admitted_by) <> '' AND admitted_at IS NOT NULL))
);

CREATE FUNCTION guard_five_write_cohort() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Five cohort records cannot be removed' USING ERRCODE = '23514';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.admitted_by IS NOT NULL OR NEW.admitted_at IS NOT NULL OR NOT EXISTS (
            SELECT FROM daily_puzzles WHERE id = NEW.puzzle_id AND game_slug = 'word-guess'
                AND puzzle_date = NEW.day_key::timestamp AND difficulty IS NULL
        ) THEN
            RAISE EXCEPTION 'Register an exact stored Five puzzle while closed' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF OLD.admitted_at IS NOT NULL OR NEW.admitted_by IS NULL OR
            (NEW.day_key, NEW.cohort, NEW.puzzle_id) IS DISTINCT FROM
            (OLD.day_key, OLD.cohort, OLD.puzzle_id) THEN
            RAISE EXCEPTION 'Five cohort permits only one admission' USING ERRCODE = '23514';
        END IF;
        NEW.admitted_at := clock_timestamp();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER five_write_cohort_guard BEFORE INSERT OR UPDATE OR DELETE ON five_write_cohorts
    FOR EACH ROW EXECUTE FUNCTION guard_five_write_cohort();
CREATE TRIGGER five_write_cohort_no_truncate BEFORE TRUNCATE ON five_write_cohorts
    FOR EACH STATEMENT EXECUTE FUNCTION guard_five_write_cohort();

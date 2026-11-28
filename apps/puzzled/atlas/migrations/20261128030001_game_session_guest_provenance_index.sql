-- atlas:txmode none

CREATE INDEX CONCURRENTLY IF NOT EXISTS game_sessions_adopted_from_guest_idx
    ON public.game_sessions (adopted_from_guest)
    WHERE adopted_from_guest IS NOT NULL;

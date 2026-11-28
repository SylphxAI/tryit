-- atlas:txmode none

CREATE INDEX CONCURRENTLY IF NOT EXISTS result_shares_adopted_from_guest_idx
    ON public.result_shares (adopted_from_guest)
    WHERE adopted_from_guest IS NOT NULL;

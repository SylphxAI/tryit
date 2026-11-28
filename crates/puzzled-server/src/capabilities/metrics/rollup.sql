WITH qualified AS MATERIALIZED (
  SELECT id, user_id, day_key, game_slug, completed_at, adopted_from_guest FROM game_sessions
  WHERE is_ritual = true AND module_class = 'puzzle_ritual' AND status IN ('won', 'lost')
    AND NOT comparison_excluded
    AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures f WHERE f.user_id=game_sessions.user_id)
), audiences AS MATERIALIZED (
  SELECT * FROM metric_audiences a
  WHERE NOT EXISTS (SELECT 1 FROM synthetic_fixtures f WHERE f.user_id=a.user_id)
), daily AS MATERIALIZED (
  SELECT DISTINCT user_id, day_key FROM qualified
), firsts AS MATERIALIZED (
  SELECT user_id, min(day_key) AS first_day, min(completed_at) AS first_at FROM qualified GROUP BY user_id
), entries AS MATERIALIZED (
  -- Each player's first qualifying finish (one cohort member per player) and
  -- the identity that recorded it. A guest credential or adopted guest row is
  -- guest entry; an account row is signed-in entry; anything else (rows from
  -- before server-issued guest credentials) stays unknown.
  SELECT DISTINCT ON (q.user_id) q.user_id, q.day_key AS first_day,
    CASE WHEN q.adopted_from_guest IS NOT NULL
           OR EXISTS (SELECT 1 FROM guest_credentials c WHERE c.user_id = q.user_id) THEN 'guest'
         WHEN EXISTS (SELECT 1 FROM auth_subjects a WHERE a.user_id = q.user_id) THEN 'signed_in'
         ELSE 'unknown' END AS entry,
    EXISTS (SELECT 1 FROM auth_subjects a WHERE a.user_id = q.user_id) AS now_signed_in
  FROM qualified q ORDER BY q.user_id, q.day_key, q.completed_at, q.id
), collected_picks AS MATERIALIZED (
  SELECT * FROM daily_free_picks
  WHERE $3::date IS NOT NULL AND day_key BETWEEN greatest($1::date, $3::date) AND $2::date
), mixed_pick_days AS (
  -- Any old writer's incomplete row invalidates the entire product day.
  SELECT DISTINCT day_key FROM collected_picks
  WHERE claimed_via IS NULL OR guest_entry IS NULL OR comparison_excluded IS NULL
), first_guest_picks AS MATERIALIZED (
  SELECT p.user_id, p.day_key, p.game_slug, p.started_at
  FROM collected_picks p
  WHERE p.guest_entry IS TRUE AND p.claimed_via = 'start' AND p.comparison_excluded IS FALSE
    -- Picks carry no origin ID, so refuse a canonical identity with any
    -- verified synthetic guest origin rather than attributing its start.
    AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures s WHERE s.user_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM guest_credentials c JOIN synthetic_fixtures s USING (user_id)
      WHERE c.adopted_user_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM mixed_pick_days m WHERE m.day_key = p.day_key)
    -- The primary key supports the lookback by user. Rank across all picks,
    -- including unknown/excluded rows, not just the candidates or report window.
    AND NOT EXISTS (SELECT 1 FROM daily_free_picks prior WHERE prior.user_id = p.user_id
      AND (prior.started_at, prior.day_key, prior.game_slug COLLATE "C")
        < (p.started_at, p.day_key, p.game_slug COLLATE "C"))
), pick_identities AS (
  SELECT p.*, p.user_id AS finish_user FROM first_guest_picks p
  UNION ALL
  -- Adoption moves picks, but finishes that collide can stay under the guest.
  SELECT p.*, c.user_id AS finish_user FROM first_guest_picks p
  JOIN guest_credentials c ON c.adopted_user_id = p.user_id
), guest_starts AS (
  SELECT day_key, count(*) AS started, count(*) FILTER (WHERE finished) AS completed_same_day
  FROM (
    SELECT p.user_id, p.day_key,
      bool_or(q.day_key = p.day_key::text AND q.game_slug = p.game_slug) AS finished
    FROM pick_identities p LEFT JOIN qualified q ON q.user_id = p.finish_user
      AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures s WHERE s.user_id = q.adopted_from_guest)
    GROUP BY p.user_id, p.day_key
    -- The legacy completion column stores a UTC wall time (see metrics.md).
    HAVING count(*) FILTER (WHERE q.completed_at < p.started_at AT TIME ZONE 'UTC'
      OR (q.completed_at IS NULL AND q.day_key <= p.day_key::text)) = 0
  ) outcomes GROUP BY day_key
), days AS MATERIALIZED (
  SELECT to_char(d, 'YYYY-MM-DD') AS day_key,
    to_char(d::date - 7, 'YYYY-MM-DD') AS week_ago
  FROM generate_series($1::date, $2::date, interval '1 day') d
), d7_returns AS (
  -- Match the distinct player-days once, rather than rescanning daily for each cohort member.
  SELECT d.day_key, count(*) AS returned
  FROM days d JOIN firsts f ON f.first_day = d.week_ago
  JOIN daily q ON q.user_id = f.user_id AND q.day_key = d.day_key
  GROUP BY d.day_key
)
SELECT days.day_key,
  (SELECT count(*) FROM daily q WHERE q.day_key = days.day_key) AS daily_puzzle_completers,
  (SELECT count(*) FROM daily q WHERE q.day_key = days.day_key
     AND EXISTS (SELECT 1 FROM auth_subjects a WHERE a.user_id = q.user_id)) AS signed_in_completers,
  (SELECT count(DISTINCT user_id) FROM game_sessions g WHERE g.day_key = days.day_key
     AND g.is_ritual = true AND g.module_class = 'entertainment_oracle' AND g.status IN ('won','lost')
     AND NOT g.comparison_excluded
     AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures f WHERE f.user_id=g.user_id)) AS daily_entertainment_completers,
  (SELECT count(*) FROM (SELECT user_id FROM daily q
     WHERE q.day_key BETWEEN to_char(days.day_key::date - 6, 'YYYY-MM-DD') AND days.day_key
     GROUP BY user_id HAVING count(*) >= 4) regulars) AS weekly_ritualists,
  (SELECT count(*) FROM firsts f WHERE f.first_day = days.week_ago) AS d7_cohort,
  COALESCE(d7_returns.returned, 0) AS d7_returned,
  (SELECT count(*) FROM funnel_events e WHERE e.event = 'share_landing'
     AND e.occurred_at >= days.day_key::date::timestamp AT TIME ZONE 'Asia/Hong_Kong'
     AND e.occurred_at < (days.day_key::date + 1)::timestamp AT TIME ZONE 'Asia/Hong_Kong') AS share_landings,
  (SELECT count(*) FROM firsts f WHERE f.first_day = days.day_key AND EXISTS (
     SELECT 1 FROM share_landings l
     WHERE l.user_id = f.user_id AND l.day_key BETWEEN to_char(days.day_key::date - 6, 'YYYY-MM-DD') AND days.day_key
       AND f.first_at >= l.landed_at AT TIME ZONE 'UTC')) AS share_landing_completers,
  COALESCE((SELECT count FROM metric_counters WHERE day_key = days.day_key AND event = 'share'), 0) AS shares,
  COALESCE((SELECT count FROM metric_counters WHERE day_key = days.day_key AND event = 'free_finish_ok'), 0) AS free_finish_ok,
  COALESCE((SELECT count FROM metric_counters WHERE day_key = days.day_key AND event = 'free_finish_failed'), 0) AS free_finish_failed,
  (SELECT count(*) FROM audiences a WHERE a.day_key = days.day_key AND a.paid) AS paid_active,
  (SELECT count(*) FROM audiences a JOIN daily q USING (user_id, day_key) WHERE a.day_key = days.day_key AND a.paid) AS paid_completers,
  (SELECT count(*) FROM audiences a WHERE a.day_key = days.day_key AND NOT a.paid) AS free_active,
  (SELECT count(*) FROM audiences a JOIN daily q USING (user_id, day_key) WHERE a.day_key = days.day_key AND NOT a.paid) AS free_completers,
  CASE WHEN days.day_key::date >= $3::date AND mixed.day_key IS NULL
    THEN coalesce(g.started, 0) END AS guest_starts,
  CASE WHEN days.day_key::date >= $3::date AND mixed.day_key IS NULL
    THEN coalesce(g.completed_same_day, 0) END AS guest_start_completed_same_day,
  zero.*, d1.*
FROM days
LEFT JOIN d7_returns USING (day_key)
LEFT JOIN mixed_pick_days mixed ON mixed.day_key = days.day_key::date
LEFT JOIN guest_starts g ON g.day_key = days.day_key::date
CROSS JOIN LATERAL (SELECT count(*) AS first_completers,
    count(*) FILTER (WHERE e.entry = 'guest') AS first_guest_entry,
    count(*) FILTER (WHERE e.entry = 'signed_in') AS first_signed_in_entry,
    count(*) FILTER (WHERE e.entry = 'guest' AND e.now_signed_in) AS first_guest_entry_now_signed_in
  FROM entries e WHERE e.first_day = days.day_key) zero
CROSS JOIN LATERAL (SELECT count(*) AS d1_cohort,
    count(*) FILTER (WHERE c.returned) AS d1_returned,
    count(*) FILTER (WHERE c.entry = 'guest') AS d1_cohort_guest_entry,
    count(*) FILTER (WHERE c.entry = 'guest' AND c.returned) AS d1_returned_guest_entry
  FROM (SELECT e.entry, EXISTS (SELECT 1 FROM daily q WHERE q.user_id = e.user_id AND q.day_key = days.day_key) AS returned
    FROM entries e WHERE e.first_day = to_char(days.day_key::date - 1, 'YYYY-MM-DD')) c) d1
ORDER BY days.day_key

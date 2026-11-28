-- Ops read model. $1 and $2 are inclusive Hong Kong product day keys (YYYY-MM-DD).
-- Prepend the shared implausible_finish_players.sql CTE.
, excluded_players AS (
  SELECT user_id FROM synthetic_fixtures
  UNION ALL
  SELECT s.user_id FROM game_sessions s
    JOIN synthetic_fixtures f ON f.user_id = s.adopted_from_guest
  UNION ALL
  -- Also exclude marked starts that never produced a finish.
  SELECT user_id FROM daily_free_picks WHERE comparison_excluded IS TRUE
  UNION ALL
  -- Before pick provenance (20261127210000), verify:live --play started Sudoku,
  -- Word Guess and Nonogram as one guest but marked only the Sudoku finish.
  -- Drop every pick by that player, even outside the marked finish's day.
  SELECT user_id FROM game_sessions WHERE comparison_excluded
)
SELECT p.game_slug, count(*) AS raw_picks, count(f.won) AS raw_finishes,
  count(*) FILTER (WHERE fast.user_id IS NULL) AS picks,
  count(f.won) FILTER (WHERE fast.user_id IS NULL) AS finishes,
  count(*) FILTER (WHERE f.won AND fast.user_id IS NULL) AS wins
FROM daily_free_picks p
LEFT JOIN implausible_finish_players fast ON fast.user_id = p.user_id
-- NULL means no matching finish; false means a loss. Reduce to one result per pick.
CROSS JOIN LATERAL (
  SELECT bool_or(s.status = 'won') AS won
  FROM game_sessions s
  WHERE s.user_id = p.user_id AND s.day_key = to_char(p.day_key, 'YYYY-MM-DD')
    AND s.game_slug = p.game_slug AND s.mode = 'daily'
    AND s.status IN ('won', 'lost') AND NOT s.comparison_excluded
) f
WHERE p.day_key BETWEEN $1::date AND $2::date
  AND NOT EXISTS (SELECT 1 FROM excluded_players e WHERE e.user_id = p.user_id)
GROUP BY p.game_slug
ORDER BY p.game_slug;

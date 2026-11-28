-- Shared, read-only attribution rule. Compose with the report's own CTEs or SELECT.
WITH finish_floors (game_slug, min_seconds) AS (
  VALUES ('word-guess', 5), ('word-ladder', 5), ('arithmo', 5),
         ('pattern-match', 8), ('word-groups', 8), ('number-path', 8), ('block-slide', 8),
         ('quad-words', 10)
), implausible_finish_players AS MATERIALIZED (
  SELECT DISTINCT s.user_id
  FROM game_sessions s
  -- With no matching pick (e.g. an entitled finish), elapsed time is unknown;
  -- keep the finish. Do not substitute client time or another game's start.
  JOIN daily_free_picks p ON p.user_id = s.user_id AND p.game_slug = s.game_slug
    AND s.day_key = to_char(p.day_key, 'YYYY-MM-DD')
  LEFT JOIN finish_floors f ON f.game_slug = s.game_slug
  WHERE s.mode = 'daily' AND s.status IN ('won', 'lost')
    AND (s.completed_at AT TIME ZONE 'UTC') - p.started_at
      < coalesce(f.min_seconds, 20) * interval '1 second'
)

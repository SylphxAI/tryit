-- Ops read model. $1 is a Hong Kong product day key (YYYY-MM-DD).
-- Count the committed ritual rows, never browser events or distinct players.
WITH eligible AS (
  SELECT s.day_key, s.game_slug, s.module_class, s.status::text AS status,
    s.adopted_from_guest IS NOT NULL AS adopted,
    EXISTS (SELECT 1 FROM guest_credentials g WHERE g.user_id = s.user_id
      AND g.created_at <= s.completed_at) AS guest_backed,
    EXISTS (SELECT 1 FROM auth_subjects a WHERE a.user_id = s.user_id
      AND a.created_at <= s.completed_at) AS auth_backed
  FROM game_sessions s
  WHERE s.day_key = $1 AND s.mode = 'daily' AND s.is_ritual
    AND s.module_class IN ('puzzle_ritual', 'entertainment_oracle')
    AND s.status IN ('won', 'lost') AND NOT s.comparison_excluded
    AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures f
      WHERE f.user_id IN (s.user_id, s.adopted_from_guest))
)
SELECT day_key, game_slug, module_class, status,
  CASE
    WHEN adopted OR (guest_backed AND NOT auth_backed) THEN 'guest'
    WHEN auth_backed AND NOT guest_backed THEN 'signed_in'
    ELSE 'unknown'
  END AS identity_kind,
  count(*) AS finishes
FROM eligible
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2, 3, 4, 5;

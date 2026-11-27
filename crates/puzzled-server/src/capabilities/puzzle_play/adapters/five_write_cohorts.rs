//! Daily Five cohort registration and read-only write admission.

use chrono::NaiveDate;
use sqlx::PgConnection;
use uuid::Uuid;

pub(crate) async fn admits(
    connection: &mut PgConnection,
    day: NaiveDate,
    puzzle_id: Uuid,
) -> Result<bool, sqlx::Error> {
    // Match both stored and requested product days: a different puzzle ID or
    // a mismatched date cannot route a registered day through legacy play.
    // An unregistered Five puzzle/day keeps the legacy behavior.
    sqlx::query_scalar(
        r#"SELECT bool_and(CASE WHEN c.puzzle_id IS NULL THEN true ELSE
                    c.puzzle_id = p.id AND c.day_key = $2 AND
                    p.puzzle_date = c.day_key::timestamp AND p.difficulty IS NULL AND
                    c.cohort = 'durable-v1' AND c.admitted_at IS NOT NULL END)
           FROM daily_puzzles p
           LEFT JOIN five_write_cohorts c ON c.puzzle_id = p.id OR
                    c.day_key IN ($2, p.puzzle_date::date)
           WHERE p.id = $1 AND p.game_slug = 'word-guess'"#,
    )
    .bind(puzzle_id)
    .bind(day)
    .fetch_one(connection)
    .await
    .map(|allowed: Option<bool>| allowed.unwrap_or(false))
}

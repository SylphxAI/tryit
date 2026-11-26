//! Read a guest's stored daily puzzle, picks and finish in one MVCC snapshot.

use std::sync::LazyLock;

use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use super::daily_free_picks::Picks;
use super::game_sessions_db::{CompletedRow, CompletedSession};
use crate::capabilities::daily_pipeline::{self, Resolved};
use crate::capabilities::identity_access::adapters::guest_credentials::ACCOUNT_BACKED;

static GUEST_SNAPSHOT_SQL: LazyLock<String> = LazyLock::new(|| {
    // Scope $1 to the candidate player for the shared account predicate, and
    // keep the stored puzzle SELECT byte-for-byte shared with pipeline resolve.
    let account_backed = ACCOUNT_BACKED.replace("$1", "candidate.user_id");
    let puzzle = daily_pipeline::store::FETCH_SQL;
    format!(
        "WITH puzzle AS ({puzzle}), candidate AS (\
           SELECT user_id FROM guest_credentials \
           WHERE token_hash = $4 AND adopted_user_id IS NULL AND revoked_at IS NULL\
         ), admitted AS (\
           SELECT candidate.user_id FROM candidate WHERE NOT ({account_backed})\
         ), picks AS (\
           SELECT count(*) AS count, coalesce(bool_or(game_slug = $1), false) AS chosen \
           FROM daily_free_picks WHERE user_id = (SELECT user_id FROM candidate) AND day_key = $5\
         ) \
         SELECT p.id, p.puzzle_data, p.solution, picks.count, picks.chosen, \
                CASE WHEN finish.status IS NOT NULL THEN ROW(finish.*) END \
         FROM puzzle p CROSS JOIN picks LEFT JOIN LATERAL (\
           SELECT status::text AS status, score, attempts, completed_at, difficulty::text, time_spent_ms \
           FROM game_sessions \
           WHERE user_id = (SELECT user_id FROM admitted) AND status IN ('won','lost') \
             AND (puzzle_id = p.id OR (game_slug = $1 AND puzzle_date = $2)) \
           ORDER BY completed_at DESC NULLS LAST, id DESC LIMIT 1\
         ) finish ON true"
    )
});

pub(crate) async fn guest(
    pool: &PgPool,
    hash: &str,
    slug: &str,
    day: NaiveDate,
    difficulty: Option<&str>,
) -> Result<Option<(Resolved, Picks, Option<CompletedSession>)>, sqlx::Error> {
    type Row = (
        Uuid,
        serde_json::Value,
        Option<serde_json::Value>,
        i64,
        bool,
        Option<CompletedRow>,
    );
    let row: Option<Row> = sqlx::query_as(sqlx::AssertSqlSafe(GUEST_SNAPSHOT_SQL.as_str()))
        .bind(slug)
        .bind(day.and_time(chrono::NaiveTime::MIN))
        .bind(daily_pipeline::stored_difficulty(slug, difficulty))
        .bind(hash)
        .bind(day)
        .fetch_optional(pool)
        .await?;
    Ok(
        row.and_then(|(id, puzzle_data, solution, count, chosen, completed)| {
            Some((
                Resolved {
                    id: Some(id.to_string()),
                    puzzle_data,
                    solution: solution?,
                },
                Picks {
                    count: u32::try_from(count).unwrap_or(u32::MAX),
                    chosen,
                },
                completed.map(CompletedSession::from),
            ))
        }),
    )
}

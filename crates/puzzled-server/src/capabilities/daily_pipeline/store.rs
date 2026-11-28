//! `daily_puzzles` SQL for the pipeline. A stored puzzle is never replaced
//! once anyone could have played it: only an unplayed future row made by a
//! superseded generator is remade ([`replace_unplayed`]). `difficulty` is
//! NULL for games without a difficulty choice, so matching uses
//! `IS NOT DISTINCT FROM` (the unique index does not cover NULLs).

use std::collections::HashSet;

use chrono::{Duration, NaiveDate, NaiveDateTime};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use puzzled_core::puzzle_play::game_slugs::all_game_slugs;
use puzzled_core::puzzle_play::generate::{difficulties_for, Generated};

use super::Resolved;

fn midnight(date: NaiveDate) -> NaiveDateTime {
    date.and_hms_opt(0, 0, 0).unwrap_or_default()
}

pub(crate) const FETCH_SQL: &str = r#"SELECT id, puzzle_data, solution FROM daily_puzzles
           WHERE game_slug = $1 AND puzzle_date = $2
             AND difficulty::text IS NOT DISTINCT FROM $3
           ORDER BY created_at ASC LIMIT 1"#;

/// The stored puzzle for exactly (game, day, difficulty).
pub async fn fetch(
    pool: &PgPool,
    game_slug: &str,
    date: NaiveDate,
    difficulty: Option<&str>,
) -> Result<Option<Resolved>, String> {
    let row: Option<(Uuid, Value, Option<Value>)> = sqlx::query_as(FETCH_SQL)
        .bind(game_slug)
        .bind(midnight(date))
        .bind(difficulty)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("daily_puzzles read failed: {e}"))?;
    Ok(match row {
        Some((id, puzzle_data, Some(solution))) => Some(Resolved {
            puzzle_data,
            solution,
            id: Some(id.to_string()),
        }),
        // A row without a solution cannot be graded: treat it as missing.
        _ => None,
    })
}

/// Store a generated puzzle unless one exists for (game, day, difficulty).
pub async fn insert(
    pool: &PgPool,
    game_slug: &str,
    date: NaiveDate,
    difficulty: Option<&str>,
    generated: &Generated,
) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO daily_puzzles
             (game_slug, puzzle_date, puzzle_data, solution, difficulty, seed, generator_version)
           SELECT $1, $2, $3, $4, $5::puzzle_difficulty, $6, $7
           WHERE NOT EXISTS (
             SELECT 1 FROM daily_puzzles
             WHERE game_slug = $1 AND puzzle_date = $2
               AND difficulty::text IS NOT DISTINCT FROM $5)
           ON CONFLICT DO NOTHING"#,
    )
    .bind(game_slug)
    .bind(midnight(date))
    .bind(&generated.puzzle_data)
    .bind(&generated.solution)
    .bind(difficulty)
    .bind(i32::try_from(generated.seed).ok())
    .bind(generated.generator_version)
    .execute(pool)
    .await
    .map_err(|e| format!("daily_puzzles insert failed for {game_slug} {date}: {e}"))?;
    Ok(())
}

/// Stored (day, difficulty) keys for one game in `[from, to]`.
pub async fn existing(
    pool: &PgPool,
    game_slug: &str,
    from: NaiveDate,
    to: NaiveDate,
) -> Result<HashSet<(NaiveDate, Option<String>)>, String> {
    let rows: Vec<(NaiveDateTime, Option<String>)> = sqlx::query_as(
        r#"SELECT puzzle_date, difficulty::text FROM daily_puzzles
           WHERE game_slug = $1 AND puzzle_date BETWEEN $2 AND $3 AND solution IS NOT NULL"#,
    )
    .bind(game_slug)
    .bind(midnight(from))
    .bind(midnight(to))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("daily_puzzles scan failed: {e}"))?;
    Ok(rows.into_iter().map(|(at, d)| (at.date(), d)).collect())
}

/// Fewest consecutive days stored from `today`, over every game and difficulty.
pub async fn min_days_ahead(pool: &PgPool, today: NaiveDate, to: NaiveDate) -> Result<i64, String> {
    let mut min = i64::MAX;
    for slug in all_game_slugs() {
        let stored = existing(pool, slug, today, to).await?;
        for difficulty in difficulties_for(slug) {
            let mut days = 0;
            let mut day = today;
            while day <= to && stored.contains(&(day, difficulty.map(str::to_string))) {
                days += 1;
                day += Duration::days(1);
            }
            min = min.min(days);
        }
    }
    Ok(if min == i64::MAX { 0 } else { min })
}

/// A stored future row made by a superseded generator.
#[derive(sqlx::FromRow)]
pub struct StaleRow {
    pub id: Uuid,
    pub puzzle_date: NaiveDateTime,
    pub difficulty: Option<String>,
    pub seed: Option<i32>,
    pub puzzle_data: Value,
    pub solution: Option<Value>,
}

/// One game's rows made by `version`, dated after `today` up to `to`.
pub async fn stale_future_rows(
    pool: &PgPool,
    game_slug: &str,
    version: &str,
    today: NaiveDate,
    to: NaiveDate,
) -> Result<Vec<StaleRow>, String> {
    sqlx::query_as(
        r#"SELECT id, puzzle_date, difficulty::text AS difficulty, seed, puzzle_data, solution
           FROM daily_puzzles WHERE game_slug = $1 AND generator_version = $2
             AND puzzle_date > $3 AND puzzle_date <= $4 ORDER BY puzzle_date, difficulty"#,
    )
    .bind(game_slug)
    .bind(version)
    .bind(midnight(today))
    .bind(midnight(to))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("daily_puzzles stale scan failed: {e}"))
}

/// Why a stale row was or was not remade.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refresh {
    Replaced,
    /// A session or free pick exists for the game and day.
    RefusedPlayed,
    /// The row's version or seed is not the one read.
    RefusedChanged,
}

/// Remake one stale row in place (`puzzle_data`, `solution`,
/// `generator_version`; id, seed and date stay) only while the row still has
/// `old_version` and no session or free pick exists for its game and day. The
/// row lock blocks a session that references it until this commits.
pub async fn replace_unplayed(
    pool: &PgPool,
    row: &StaleRow,
    old_version: &str,
    generated: &Generated,
) -> Result<Refresh, String> {
    let fail = |e: sqlx::Error| format!("daily_puzzles refresh failed for {}: {e}", row.id);
    let mut tx = pool.begin().await.map_err(fail)?;
    // Lock the row (only if it still has `old_version`) and count its plays.
    let counts: Option<(i64, i64)> = sqlx::query_as(
        r#"SELECT
             (SELECT count(*) FROM game_sessions
               WHERE puzzle_id = p.id OR (game_slug = p.game_slug AND puzzle_date = p.puzzle_date)),
             (SELECT count(*) FROM daily_free_picks
               WHERE game_slug = p.game_slug AND day_key = p.puzzle_date::date)
           FROM daily_puzzles p WHERE p.id = $1 AND p.generator_version = $2 FOR UPDATE OF p"#,
    )
    .bind(row.id)
    .bind(old_version)
    .fetch_optional(&mut *tx)
    .await
    .map_err(fail)?;
    let Some((sessions, picks)) = counts else {
        return Ok(Refresh::RefusedChanged);
    };
    if sessions + picks > 0 {
        return Ok(Refresh::RefusedPlayed);
    }
    sqlx::query(
        "UPDATE daily_puzzles SET puzzle_data = $2, solution = $3, generator_version = $4
         WHERE id = $1",
    )
    .bind(row.id)
    .bind(&generated.puzzle_data)
    .bind(&generated.solution)
    .bind(generated.generator_version)
    .execute(&mut *tx)
    .await
    .map_err(fail)?;
    tx.commit().await.map_err(fail)?;
    Ok(Refresh::Replaced)
}

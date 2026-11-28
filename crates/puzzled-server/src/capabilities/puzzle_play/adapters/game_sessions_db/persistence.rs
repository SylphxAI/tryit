//! Write a game session and its derived ritual fields to the same row.
//! `completed_at` stores the transaction instant as UTC wall time, without a zone.

use sqlx::PgPool;

use puzzled_core::puzzle_play::game_flows::{GameMode, SaveResultPlan};
use puzzled_core::puzzle_play::ritual_completion::{
    build_ritual_completed, qualifies_as_ritual, RitualQualifyInput,
};

use super::parse_user_id;

/// Fit client-reported elapsed time into game_sessions.time_spent_ms (PostgreSQL INT4).
pub(crate) fn storage_elapsed_ms(reported_ms: u64) -> i32 {
    i32::try_from(reported_ms).unwrap_or(i32::MAX)
}

#[derive(Debug, Clone)]
pub struct PersistGameSessionInput<'a> {
    pub user_id: &'a str,
    pub score: Option<i32>,
    pub plan: &'a SaveResultPlan,
}

/// Insert a completed/abandoned game session row. Returns session id.
pub async fn persist_game_session(
    pool: &PgPool,
    input: PersistGameSessionInput<'_>,
) -> Result<String, String> {
    let uid = parse_user_id(input.user_id)?;
    // DB enum game_status: in_progress|won|lost|abandoned
    let status = input.plan.status.as_str();
    // DB enum game_mode: daily|archive (practice maps to daily for storage)
    let mode = match input.plan.mode {
        GameMode::Archive => "archive",
        GameMode::Daily | GameMode::Practice => "daily",
    };
    let row: (uuid::Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO game_sessions (
            user_id, game_slug, difficulty, mode, status, score, attempts, time_spent_ms, completed_at
        ) VALUES (
            $1, $2,
            $3::puzzle_difficulty,
            $4::game_mode,
            $5::game_status,
            $6, $7, $8,
            now() AT TIME ZONE 'UTC'
        )
        RETURNING id
        "#,
    )
    .bind(uid)
    .bind(&input.plan.game_slug)
    .bind(input.plan.difficulty.as_deref())
    .bind(mode)
    .bind(status)
    .bind(input.score)
    .bind(input.plan.attempts as i32)
    .bind(storage_elapsed_ms(input.plan.time_spent_ms))
    .fetch_one(pool)
    .await
    .map_err(|e| format!("game_sessions insert failed: {e}"))?;
    Ok(row.0.to_string())
}

/// Inputs for storing a server-validated result.
pub struct ValidatedSession<'a> {
    pub user_id: &'a str,
    pub game_slug: &'a str,
    pub difficulty: Option<&'a str>,
    pub mode: &'a str,
    pub status: &'a str,
    pub score: Option<i32>,
    pub attempts: u32,
    pub time_spent_ms: u64,
    pub puzzle_id: Option<&'a str>,
    pub puzzle_date: Option<chrono::NaiveDate>,
    pub day_key: Option<chrono::NaiveDate>,
    pub at_ms: i64,
    pub hints_used: Option<i64>,
    pub comparison_excluded: bool,
}

/// Persist a server-validated result in its own transaction.
pub async fn persist_validated_session(
    pool: &PgPool,
    session: ValidatedSession<'_>,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value = persist_validated_session_on_connection(&mut tx, session).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

/// Persist a server-validated result on the caller's connection.
///
/// When the finish qualifies as a ritual, also writes `day_key`, `module_class`,
/// `is_ritual`, and `finish_kind` on the same row (sole instrumentation path).
pub async fn persist_validated_session_on_connection(
    connection: &mut sqlx::PgConnection,
    session: ValidatedSession<'_>,
) -> Result<String, String> {
    let ValidatedSession {
        user_id,
        game_slug,
        difficulty,
        mode,
        status,
        score,
        attempts,
        time_spent_ms,
        puzzle_id,
        puzzle_date,
        day_key,
        at_ms,
        hints_used,
        comparison_excluded,
    } = session;
    let uid = parse_user_id(user_id)?;
    let pid = match puzzle_id {
        Some(p) => Some(uuid::Uuid::parse_str(p).map_err(|e| format!("invalid puzzle id: {e}"))?),
        None => None,
    };
    let date = match puzzle_date {
        Some(d) => Some(d.and_hms_opt(0, 0, 0).ok_or("invalid date")?),
        None => None,
    };

    let ritual = if qualifies_as_ritual(RitualQualifyInput {
        game_module_id: game_slug,
        mode,
        status,
        is_dry_run: false,
    }) {
        let dk = day_key.ok_or("day_key required for ritual completion")?;
        build_ritual_completed(
            user_id,
            game_slug,
            dk,
            status,
            puzzle_id.map(str::to_string),
            at_ms,
        )
    } else {
        None
    };

    let (day_key_str, module_class, is_ritual, finish_kind) = match &ritual {
        Some(r) => (
            Some(r.day_key.as_str()),
            Some(r.module_class.as_str()),
            true,
            Some(r.finish_kind.as_str()),
        ),
        None => (None, None, false, None),
    };

    let row: Result<Option<(uuid::Uuid,)>, sqlx::Error> = sqlx::query_as(
        r#"
        INSERT INTO game_sessions (
            user_id, game_slug, puzzle_id, puzzle_date, difficulty, mode, status,
            score, attempts, time_spent_ms, completed_at,
            day_key, module_class, is_ritual, finish_kind, hints_used, comparison_excluded
        ) VALUES (
            $1, $2, $3, $4,
            $5::puzzle_difficulty,
            $6::game_mode,
            $7::game_status,
            $8, $9, $10,
            now() AT TIME ZONE 'UTC',
            $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (user_id, puzzle_id) DO NOTHING
        RETURNING id
        "#,
    )
    .bind(uid)
    .bind(game_slug)
    .bind(pid)
    .bind(date)
    .bind(difficulty)
    .bind(mode)
    .bind(status)
    .bind(score)
    .bind(attempts as i32)
    .bind(storage_elapsed_ms(time_spent_ms))
    .bind(day_key_str)
    .bind(module_class)
    .bind(is_ritual)
    .bind(finish_kind)
    .bind(hints_used)
    .bind(comparison_excluded)
    .fetch_optional(&mut *connection)
    .await;

    match row {
        Ok(Some((id,))) => Ok(id.to_string()),
        // (user_id, puzzle_id) unique hit — idempotent no-op.
        Ok(None) => Err("already_played".to_string()),
        Err(e) => {
            // Ritual partial unique (user_id, game_slug, day_key) — race after
            // pre-check, or second finish with null puzzle_id.
            if is_unique_violation(&e) {
                return Err("already_played".to_string());
            }
            Err(format!("game_sessions insert failed: {e}"))
        }
    }
}

fn is_unique_violation(err: &sqlx::Error) -> bool {
    match err {
        sqlx::Error::Database(db) => {
            // Postgres unique_violation
            db.code().as_deref() == Some("23505")
        }
        _ => false,
    }
}

//! Run the operator SQL verbatim against the migrated schema.
use sqlx::PgPool;
use uuid::Uuid;

use super::fresh_database;
use crate::capabilities::{
    identity_access::adapters::platform_jwt::VerifiedIdentity,
    puzzle_play::adapters::game_sessions_db::adopt_guest_sessions,
};

const FIRST: &str = "2026-11-19";
const LAST: &str = "2026-11-25";
const BEFORE: &str = "2026-11-18";
const AFTER: &str = "2026-11-26";
const CAGE: &str = "killer-sudoku";
const PAINT: &str = "nonogram";

async fn pick(pool: &PgPool, user: Uuid, day: &str, game: &str, marked: Option<bool>) {
    sqlx::query(
        "INSERT INTO daily_free_picks (user_id, day_key, game_slug, comparison_excluded)
         VALUES ($1, $2::text::date, $3, $4)",
    )
    .bind(user)
    .bind(day)
    .bind(game)
    .bind(marked)
    .execute(pool)
    .await
    .unwrap();
}

async fn finish(
    pool: &PgPool,
    user: Uuid,
    day: Option<&str>,
    game: &str,
    mode: &str,
    status: &str,
) {
    sqlx::query(
        "INSERT INTO game_sessions (user_id, day_key, game_slug, mode, status, completed_at)
         VALUES ($1, $2, $3, $4::text::game_mode, $5::text::game_status, now())",
    )
    .bind(user)
    .bind(day)
    .bind(game)
    .bind(mode)
    .bind(status)
    .execute(pool)
    .await
    .unwrap();
}

async fn report(pool: &PgPool, from: &str, to: &str) -> Vec<(String, i64, i64, i64)> {
    sqlx::query_as(include_str!("../capabilities/funnel/pick_completions.sql"))
        .bind(from.parse::<chrono::NaiveDate>().unwrap())
        .bind(to.parse::<chrono::NaiveDate>().unwrap())
        .fetch_all(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn pick_completions_matches_daily_finishes_once_and_excludes_marked_players() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let [cage, painter, loser, harness, marked, marked_elsewhere, fixture, owner, guest, account] =
        std::array::from_fn(|_| Uuid::now_v7());

    // A Cage pick without a qualifying finish; each near miss differs by one field.
    pick(&pool, cage, FIRST, CAGE, None).await;
    finish(&pool, cage, Some(BEFORE), CAGE, "daily", "won").await;
    finish(&pool, cage, Some(FIRST), PAINT, "daily", "won").await;
    finish(&pool, cage, Some(FIRST), CAGE, "archive", "won").await;
    // Practice is stored as 'daily' with no product day key.
    finish(&pool, cage, None, CAGE, "daily", "won").await;
    finish(&pool, cage, Some(FIRST), CAGE, "daily", "in_progress").await;
    finish(&pool, Uuid::now_v7(), Some(FIRST), CAGE, "daily", "won").await;

    pick(&pool, painter, FIRST, PAINT, None).await;
    finish(&pool, painter, Some(FIRST), PAINT, "daily", "won").await;
    // Non-ritual sessions can share a player, game and day in the schema.
    finish(&pool, painter, Some(FIRST), PAINT, "daily", "won").await;
    pick(&pool, loser, LAST, PAINT, Some(false)).await;
    finish(&pool, loser, Some(LAST), PAINT, "daily", "lost").await;
    for (outside, game) in [(BEFORE, CAGE), (AFTER, PAINT)] {
        pick(&pool, painter, outside, game, None).await;
    }

    // Historical harness: a single marked finish, no flags on either pick.
    pick(&pool, harness, LAST, "sudoku", None).await;
    pick(&pool, harness, LAST, PAINT, None).await;
    sqlx::query(
        "INSERT INTO game_sessions (user_id, day_key, game_slug, status, comparison_excluded)
         VALUES ($1, $2, 'sudoku', 'won', true)",
    )
    .bind(harness)
    .bind(LAST)
    .execute(&pool)
    .await
    .unwrap();
    pick(&pool, harness, FIRST, CAGE, None).await;
    pick(&pool, marked, LAST, CAGE, Some(true)).await;
    pick(&pool, marked_elsewhere, AFTER, CAGE, Some(true)).await;
    pick(&pool, marked_elsewhere, LAST, PAINT, None).await;

    sqlx::query(
        "INSERT INTO synthetic_fixtures (user_id, fixture_key, auth_subject, synthetic_time)
         VALUES ($1, 'pick-fixture', 'pick-fixture', now())",
    )
    .bind(fixture)
    .execute(&pool)
    .await
    .unwrap();
    pick(&pool, fixture, FIRST, CAGE, None).await;
    sqlx::query(
        "INSERT INTO game_sessions (user_id, day_key, game_slug, status, adopted_from_guest)
         VALUES ($1, $2, 'word-guess', 'won', $3)",
    )
    .bind(owner)
    .bind(BEFORE)
    .bind(fixture)
    .execute(&pool)
    .await
    .unwrap();
    pick(&pool, owner, LAST, PAINT, None).await;

    // Prove that adoption keeps one pick with its finish and does not exclude a real guest.
    pick(&pool, guest, LAST, PAINT, Some(false)).await;
    finish(&pool, guest, Some(LAST), PAINT, "daily", "won").await;
    assert_eq!(
        report(&pool, FIRST, FIRST).await,
        vec![(CAGE.into(), 1, 0, 0), (PAINT.into(), 1, 1, 1)]
    );
    assert_eq!(
        report(&pool, LAST, LAST).await,
        vec![(PAINT.into(), 2, 2, 1)]
    );
    let expected = vec![(CAGE.into(), 1, 0, 0), (PAINT.into(), 3, 3, 2)];
    assert_eq!(report(&pool, FIRST, LAST).await, expected);

    sqlx::query("INSERT INTO auth_subjects (subject, user_id) VALUES ('pick-account', $1)")
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO guest_credentials (token_hash, user_id, provenance)
         VALUES ('pick-guest-hash', $1, 'server_issued')",
    )
    .bind(guest)
    .execute(&pool)
    .await
    .unwrap();
    let account_identity = VerifiedIdentity {
        user_id: account.to_string(),
        display_name: None,
        email: None,
        actor: None,
    };
    assert_eq!(
        adopt_guest_sessions(
            &pool,
            &account_identity,
            &format!("guest_{guest}"),
            "pick-guest-hash"
        )
        .await
        .unwrap(),
        1
    );
    let pick_owner: Uuid =
        sqlx::query_scalar("SELECT user_id FROM daily_free_picks WHERE user_id IN ($1, $2)")
            .bind(guest)
            .bind(account)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(pick_owner, account);
    assert_eq!(report(&pool, FIRST, LAST).await, expected);
}

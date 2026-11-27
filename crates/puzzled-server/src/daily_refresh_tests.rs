//! The pipeline remakes unplayed future rows made by a superseded generator,
//! in place, and never touches a row anyone could have played.

use chrono::{Duration, NaiveDate, NaiveDateTime};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use puzzled_core::puzzle_play::generate::{
    self, Generated, DAILY_SEED_V2_START, GENERATOR_NONOGRAM_V2, GENERATOR_V1,
};

use crate::capabilities::daily_pipeline::{self, store};
use crate::test_support::fresh_database;

type Row = (
    Uuid,
    NaiveDateTime,
    Value,
    Option<Value>,
    Option<String>,
    Option<i32>,
);

/// Every easy nonogram row, in date order.
async fn rows(pool: &PgPool) -> Vec<Row> {
    sqlx::query_as(
        "SELECT id, puzzle_date, puzzle_data, solution, generator_version, seed FROM daily_puzzles
         WHERE game_slug = 'nonogram' AND difficulty = 'easy' ORDER BY puzzle_date",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_else(|e| panic!("rows: {e}"))
}

/// Store a V1-labelled easy nonogram row: stale data, or the current
/// generator's own output when `current` is set.
async fn store_v1(pool: &PgPool, day: NaiveDate, current: bool) {
    let made = generate::generate("nonogram", day, Some("easy")).unwrap_or_else(|e| panic!("{e}"));
    let generated = Generated {
        generator_version: GENERATOR_V1,
        ..if current {
            made
        } else {
            Generated {
                puzzle_data: json!({"stale": true}),
                solution: json!({"grid": []}),
                ..made
            }
        }
    };
    store::insert(pool, "nonogram", day, Some("easy"), &generated)
        .await
        .unwrap_or_else(|e| panic!("insert {day}: {e}"));
}

#[tokio::test]
async fn unplayed_future_rows_are_remade_and_played_or_current_rows_are_not() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let today = DAILY_SEED_V2_START - Duration::days(6);
    let day = |n: i64| today + Duration::days(n);
    // -1: past, 0: today, 1: unplayed, 2: session by day, 3: free pick,
    // 4: already the current output, 5: session by puzzle id.
    for n in -1..=5 {
        store_v1(&pool, day(n), n == 4).await;
    }
    // 6: a buffered V1 row at cutover. Even unplayed, a different seed
    // must not pass the existing refresh guard.
    let old_seed = generate::seed_for(day(6), Some("easy"));
    let (puzzle_data, solution) = generate::generate_seeded("nonogram", old_seed, Some("easy"))
        .unwrap_or_else(|e| panic!("generate buffered row: {e}"));
    let v2 = generate::generate("nonogram", day(6), Some("easy")).unwrap();
    assert_ne!(v2.seed, old_seed);
    assert_ne!((&v2.puzzle_data, &v2.solution), (&puzzle_data, &solution));
    store::insert(
        &pool,
        "nonogram",
        day(6),
        Some("easy"),
        &Generated {
            puzzle_data,
            solution,
            seed: old_seed,
            generator_version: GENERATOR_V1,
        },
    )
    .await
    .unwrap_or_else(|e| panic!("insert buffered row: {e}"));
    let before = rows(&pool).await;
    let id = |n: i64| before[usize::try_from(n + 1).unwrap_or_default()].0;
    let player = Uuid::now_v7();
    let midnight = day(2).and_hms_opt(0, 0, 0);
    for (on_day, puzzle) in [(midnight, None), (None, Some(id(5)))] {
        sqlx::query("INSERT INTO game_sessions (user_id, game_slug, puzzle_date, puzzle_id) VALUES ($1, 'nonogram', $2, $3)")
            .bind(player).bind(on_day).bind(puzzle).execute(&pool).await
            .unwrap_or_else(|e| panic!("session: {e}"));
    }
    sqlx::query(
        "INSERT INTO daily_free_picks (user_id, day_key, game_slug) VALUES ($1, $2, 'nonogram')",
    )
    .bind(player)
    .bind(day(3))
    .execute(&pool)
    .await
    .unwrap_or_else(|e| panic!("pick: {e}"));

    let replaced = daily_pipeline::refresh_unplayed(&pool, today).await;
    assert_eq!(replaced, Ok(1));
    let after = rows(&pool).await;
    // The unplayed future row is remade in place: same id, date and seed.
    let made =
        generate::generate("nonogram", day(1), Some("easy")).unwrap_or_else(|e| panic!("{e}"));
    let fresh = &after[2];
    assert_eq!(
        (fresh.0, fresh.1, fresh.5),
        (before[2].0, before[2].1, before[2].5)
    );
    assert_eq!(
        (&fresh.2, fresh.3.as_ref()),
        (&made.puzzle_data, Some(&made.solution))
    );
    assert_eq!(fresh.4.as_deref(), Some(GENERATOR_NONOGRAM_V2));
    // Past, today's, played, picked, current and different-seed rows are untouched.
    for i in [0, 1, 3, 4, 5, 6, 7] {
        assert_eq!(after[i], before[i], "row {i}");
    }
    // Running again changes nothing.
    assert_eq!(daily_pipeline::refresh_unplayed(&pool, today).await, Ok(0));
    assert_eq!(rows(&pool).await, after);
}

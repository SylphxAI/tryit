use super::{fresh_database, metrics, time};
use puzzled_core::puzzle_play::ritual_completion::{DRC_RECOMPUTE_SQL, HRC_RECOMPUTE_SQL};
use uuid::Uuid;

#[tokio::test]
async fn rollup_uses_server_finish_floors_for_completers_and_cohorts() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let [sudoku, five, fast, tie, entitled, quad, quad_fast] =
        std::array::from_fn(|_| Uuid::now_v7());
    for (user, game, seconds, via) in [
        (sudoku, "sudoku", 25, Some("start")),
        (five, "word-guess", 6, Some("start")),
        (fast, "word-guess", 4, Some("start")),
        (tie, "sudoku", 0, Some("finish")),
        (entitled, "sudoku", 1, None),
        (quad, "quad-words", 12, Some("start")),
        (quad_fast, "quad-words", 9, Some("start")),
    ] {
        if let Some(via) = via {
            sqlx::query("INSERT INTO daily_free_picks
                (user_id, day_key, game_slug, started_at, claimed_via, guest_entry, comparison_excluded)
                VALUES ($1,'2026-11-24',$2,'2026-11-23 16:00Z',$3,true,false)")
                .bind(user).bind(game).bind(via).execute(&pool).await.unwrap();
            sqlx::query(
                "INSERT INTO guest_credentials (token_hash, user_id, provenance)
                VALUES ($1, $2, 'server_issued')",
            )
            .bind(format!("test-{user}"))
            .bind(user)
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::query(
            "INSERT INTO game_sessions
            (user_id, day_key, game_slug, mode, status, is_ritual, module_class,
             completed_at, completed_at_utc, time_spent_ms)
            VALUES ($1,'2026-11-24',$2,'daily','won',true,'puzzle_ritual',
                timestamp '2026-11-23 16:00' + make_interval(secs => $3),
                timestamptz '2026-11-23 16:00Z' + make_interval(secs => $3), 300000)",
        )
        .bind(user)
        .bind(game)
        .bind(f64::from(seconds))
        .execute(&pool)
        .await
        .unwrap();
    }

    // A plausible later finish cannot reintroduce an excluded player as a first finisher or return.
    for user in [sudoku, fast, tie, quad, quad_fast] {
        sqlx::query("INSERT INTO game_sessions
            (user_id, day_key, game_slug, mode, status, is_ritual, module_class, completed_at, completed_at_utc)
            VALUES ($1,'2026-11-25','sudoku','daily','won',true,'puzzle_ritual','2026-11-25 03:00','2026-11-25 03:00Z')")
            .bind(user).execute(&pool).await.unwrap();
    }
    metrics::rollup_with_guest_start_boundary(
        &pool,
        time("2026-11-25T16:17:00Z"),
        Some("2026-11-23T00:00:00Z"),
    )
    .await
    .unwrap();
    let reports = metrics::reports(&pool).await.unwrap();
    let day = &reports[2].0;
    assert_eq!(day.day_key, "2026-11-24");
    assert_eq!(day.daily_puzzle_completers, 4);
    let cohorts = day.cohorts.as_ref().unwrap();
    assert_eq!(
        (cohorts.first_completers, cohorts.first_guest_entry),
        (4, 3)
    );
    let starts = day.guest_start_cohort.as_ref().unwrap();
    assert_eq!((starts.started, starts.completed_same_day), (3, 3));

    let next = &reports[1].0;
    assert_eq!(next.daily_puzzle_completers, 2);
    let cohorts = next.cohorts.as_ref().unwrap();
    assert_eq!(
        (
            cohorts.first_completers,
            cohorts.d1_cohort,
            cohorts.d1_returned
        ),
        (0, 4, 2)
    );
    for (sql, expected) in [(DRC_RECOMPUTE_SQL, 4), (HRC_RECOMPUTE_SQL, 0)] {
        let count: i64 = sqlx::query_scalar(sql)
            .bind(&day.day_key)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, expected);
    }
}

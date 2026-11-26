use super::support::{absent_percentile, rpc, seed};
use crate::test_support::fresh_database;
use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key_string;
use serde_json::json;
use uuid::Uuid;

pub(super) async fn excludes_wrong_cohorts_and_orders_losses() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let me = seed(&pool, "sudoku", 5).await;
    let day = product_day_key_string(Utc::now());
    for (slug, d, mode, ritual, class, status, synthetic) in [
        (
            "sudoku",
            day.as_str(),
            "daily",
            false,
            "puzzle_ritual",
            "won",
            false,
        ),
        (
            "sudoku",
            day.as_str(),
            "daily",
            true,
            "puzzle_ritual",
            "in_progress",
            false,
        ),
        (
            "sudoku",
            day.as_str(),
            "daily",
            true,
            "puzzle_ritual",
            "abandoned",
            false,
        ),
        (
            "sudoku",
            "2000-01-01",
            "daily",
            true,
            "puzzle_ritual",
            "won",
            false,
        ),
        ("sudoku", day.as_str(), "daily", true, "other", "won", false),
        (
            "crossword",
            day.as_str(),
            "daily",
            true,
            "puzzle_ritual",
            "won",
            false,
        ),
        (
            "sudoku",
            day.as_str(),
            "archive",
            true,
            "puzzle_ritual",
            "won",
            false,
        ),
        (
            "sudoku",
            day.as_str(),
            "daily",
            true,
            "puzzle_ritual",
            "won",
            true,
        ),
    ] {
        sqlx::query(
            "INSERT INTO game_sessions (user_id,game_slug,day_key,mode,
            is_ritual,module_class,status,comparison_excluded,time_spent_ms)
            VALUES ($1,$2,$3,$4::game_mode,$5,$6,$7::game_status,$8,99000)",
        )
        .bind(Uuid::now_v7())
        .bind(slug)
        .bind(d)
        .bind(mode)
        .bind(ritual)
        .bind(class)
        .bind(status)
        .bind(synthetic)
        .execute(&pool)
        .await
        .unwrap();
    }
    let body = json!({"gameSlug":"sudoku", "dayKey":day});
    let v = rpc(Some(&pool), Some(me), body.clone()).await;
    assert_eq!(v["totalPlayers"], 12);
    assert_eq!(v["percentile"], 50);
    sqlx::query("UPDATE game_sessions SET status='lost' WHERE time_spent_ms=1000")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        rpc(Some(&pool), Some(me), body.clone()).await["percentile"],
        58
    );
    sqlx::query("UPDATE game_sessions SET time_spent_ms=6000 WHERE time_spent_ms=7000")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        rpc(Some(&pool), Some(me), body.clone()).await["percentile"],
        50
    );
    // A loss never beats a win even with a faster metric. It beats only slower losses.
    sqlx::query("UPDATE game_sessions SET status='lost' WHERE user_id=$1")
        .bind(me)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        rpc(Some(&pool), Some(me), body.clone()).await["percentile"],
        0
    );
    sqlx::query("UPDATE game_sessions SET status='won',time_spent_ms=6000 WHERE game_slug='sudoku' AND NOT comparison_excluded AND is_ritual AND mode='daily' AND day_key=$1 AND module_class='puzzle_ritual' AND status IN ('won','lost')")
        .bind(&day).execute(&pool).await.unwrap();
    assert_eq!(
        rpc(Some(&pool), Some(me), body.clone()).await["percentile"],
        0
    );
    let past = rpc(
        Some(&pool),
        Some(me),
        json!({"gameSlug":"sudoku","dayKey":"2000-01-01"}),
    )
    .await;
    absent_percentile(&past, "different_day");
    pool.close().await;
}

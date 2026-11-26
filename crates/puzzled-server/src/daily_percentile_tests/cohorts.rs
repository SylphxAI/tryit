use super::support::{absent_percentile, rpc, seed};
use crate::test_support::fresh_database;
use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key_string;
use serde_json::json;
use uuid::Uuid;

pub(super) async fn every_game_strict_ties_and_authority() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    // Hand-computed fixtures: six strictly worse rows / twelve, including self.
    for slug in [
        "sudoku",
        "word-search",
        "nonogram",
        "killer-sudoku",
        "crowns",
        "duo",
        "crossword",
        "number-path",
        "pip-place",
        "pattern-match",
        "block-slide",
        "word-ladder",
        "word-guess",
        "quad-words",
        "arithmo",
        "word-box",
        "word-hive",
        "word-groups",
        "cryptogram",
    ] {
        let at = match slug {
            "word-hive" => 6,
            "word-groups" => 1,
            "cryptogram" => 4,
            _ => 5,
        };
        let me = seed(&pool, slug, at).await;
        // Even a valid identity cannot assert a metric or a denominator.
        let v = rpc(
            Some(&pool),
            Some(me),
            json!({"gameSlug":slug,
            "status":"lost", "score":2147483647,"attempts":0,"mistakes":0,
            "timeSpentMs":"0", "totalPlayers":1,"betterThan":999}),
        )
        .await;
        assert_eq!(v["percentile"], 50, "{slug}: {v}");
        assert_eq!(v["totalPlayers"], 12, "{slug}");
        assert_eq!(v["dayKey"], product_day_key_string(Utc::now()));
        assert_eq!(v["dispatch"], "product_db_sessions");
        assert!(v.get("score").is_none()); // no row export, even echoing caller input
        let unknown = rpc(
            Some(&pool),
            Some(Uuid::now_v7()),
            json!({"gameSlug":slug,"status":"won"}),
        )
        .await;
        absent_percentile(&unknown, "accepted_finish_required");
        let anon = rpc(
            Some(&pool),
            None,
            json!({"gameSlug":slug,"totalPlayers":100,"betterThan":100}),
        )
        .await;
        absent_percentile(&anon, "accepted_finish_required");
    }
    pool.close().await;
}

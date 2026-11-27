use super::parse_user_id;
use puzzled_core::puzzle_play::ritual_completion::{
    build_ritual_completed, qualifies_as_ritual, submit_must_guard_already_played, FinishKind,
    RitualQualifyInput,
};

#[test]
fn ritual_fields_derived_for_daily_won() {
    let day = chrono::NaiveDate::from_ymd_opt(2026, 8, 12).expect("d");
    assert!(qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "won",
        is_dry_run: false,
    }));
    let ev = build_ritual_completed("u1", "sudoku", day, "won", Some("p1".into()), 0).expect("ev");
    assert_eq!(ev.finish_kind, FinishKind::Success);
    assert_eq!(ev.day_key, "2026-08-12");
    assert!(ev.is_ritual);
}

/// Shell policy: pre-check + unique index cover null puzzle_id double-finish.
#[test]
fn dogfood_double_finish_requires_date_or_ritual_guard() {
    // Historical bug: only called has_completed_session when pid was Some.
    assert!(submit_must_guard_already_played(true, None, true));
    assert!(!submit_must_guard_already_played(false, None, true));
}

/// Live tip b3abfd8/#76: guest SubmitGuess past identity gate then
/// `session_lookup_failed` because `guest_<uuid>` was parsed as a UUID.
#[test]
fn guest_logical_user_id_maps_to_storage_uuid() {
    let uid = parse_user_id("guest_a1b2c3d4-e5f6-7890-abcd-ef1234567890").expect("guest");
    assert_eq!(uid.to_string(), "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    let platform = parse_user_id("f715210b-9df3-4945-b5bd-94fc4609bc30").expect("platform");
    assert_eq!(platform.to_string(), "f715210b-9df3-4945-b5bd-94fc4609bc30");
    assert!(parse_user_id("not-a-uuid").is_err());
}

#[tokio::test]
async fn session_writers_saturate_elapsed_at_int4_ceiling() {
    use super::{
        persist_game_session, persist_validated_session, PersistGameSessionInput, ValidatedSession,
    };
    use puzzled_core::puzzle_play::game_flows::{ClaimedStatus, GameMode, SaveResultPlan};

    let Some(pool) = crate::test_support::fresh_database().await else {
        return;
    };
    let user = uuid::Uuid::now_v7().to_string();
    for (elapsed, stored) in [
        (0, 0),
        (2_147_483_647, 2_147_483_647),
        (2_147_483_648, 2_147_483_647),
        (u64::MAX, 2_147_483_647),
    ] {
        let plan = SaveResultPlan {
            game_slug: "sudoku".into(),
            mode: GameMode::Practice,
            status: ClaimedStatus::Won,
            attempts: 1,
            time_spent_ms: elapsed,
            puzzle_id: String::new(),
            puzzle_date: String::new(),
            archive_date: None,
            difficulty: None,
        };
        let regular = persist_game_session(
            &pool,
            PersistGameSessionInput {
                user_id: &user,
                score: None,
                plan: &plan,
            },
        )
        .await
        .unwrap();
        let validated = persist_validated_session(
            &pool,
            ValidatedSession {
                user_id: &user,
                game_slug: "sudoku",
                difficulty: None,
                mode: "archive",
                status: "won",
                score: None,
                attempts: 1,
                time_spent_ms: elapsed,
                puzzle_id: None,
                puzzle_date: None,
                day_key: None,
                at_ms: 0,
                hints_used: None,
                comparison_excluded: false,
            },
        )
        .await
        .unwrap();
        for id in [regular, validated] {
            let actual: i32 =
                sqlx::query_scalar("SELECT time_spent_ms FROM game_sessions WHERE id=$1")
                    .bind(uuid::Uuid::parse_str(&id).unwrap())
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(actual, stored, "elapsed={elapsed}");
        }
    }
    pool.close().await;
}

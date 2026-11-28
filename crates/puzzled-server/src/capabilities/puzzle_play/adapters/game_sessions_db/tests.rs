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

#[tokio::test]
async fn pool_writer_stores_utc_wall_time_in_a_non_utc_session() {
    use super::{persist_game_session, PersistGameSessionInput};
    use puzzled_core::puzzle_play::game_flows::{ClaimedStatus, GameMode, SaveResultPlan};

    let Some(db) = crate::test_support::fresh_database().await else {
        return;
    };
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect_with((*db.connect_options()).clone())
        .await
        .unwrap();
    // The pool writer uses an implicit transaction. Capture the effective zone
    // and the independent UTC transaction clock inside the INSERT itself.
    sqlx::raw_sql(
        "SET TIME ZONE 'America/Phoenix';
         CREATE TEMP TABLE write_clock (id uuid, zone text, utc_wall timestamp);
         CREATE FUNCTION pg_temp.capture_write_clock() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
             INSERT INTO pg_temp.write_clock
             VALUES (NEW.id, current_setting('TimeZone'), transaction_timestamp() AT TIME ZONE 'UTC');
             RETURN NEW;
         END;
         $$;
         CREATE TRIGGER capture_write_clock AFTER INSERT ON game_sessions
         FOR EACH ROW EXECUTE FUNCTION pg_temp.capture_write_clock();",
    )
    .execute(&pool)
    .await
    .unwrap();

    let id = persist_game_session(
        &pool,
        PersistGameSessionInput {
            user_id: &uuid::Uuid::now_v7().to_string(),
            score: Some(80),
            plan: &SaveResultPlan {
                game_slug: "sudoku".into(),
                mode: GameMode::Archive,
                status: ClaimedStatus::Won,
                attempts: 2,
                time_spent_ms: 61_000,
                puzzle_id: String::new(),
                puzzle_date: String::new(),
                archive_date: None,
                difficulty: None,
            },
        },
    )
    .await
    .unwrap();
    let (zone, stored_utc): (String, bool) = sqlx::query_as(
        "SELECT c.zone, g.completed_at = c.utc_wall
         FROM game_sessions g JOIN pg_temp.write_clock c USING (id) WHERE g.id = $1",
    )
    .bind(uuid::Uuid::parse_str(&id).unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(zone, "America/Phoenix");
    assert!(
        stored_utc,
        "pool writer must store the UTC transaction clock"
    );
}

#[tokio::test]
async fn validated_writer_keeps_utc_clock_and_hong_kong_day_under_non_utc_transaction() {
    use super::{persist_validated_session_on_connection, ValidatedSession};
    use puzzled_core::puzzle_play::daily_time::product_day_key;
    use sqlx::Acquire;

    let Some(pool) = crate::test_support::fresh_database().await else {
        return;
    };
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL TIME ZONE 'America/Phoenix'")
        .execute(&mut *tx)
        .await
        .unwrap();
    let zone: String = sqlx::query_scalar("SELECT current_setting('TimeZone')")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(zone, "America/Phoenix");

    // A submission instant just across midnight in Hong Kong, but not in UTC.
    let submission = "2026-11-27T16:00:00Z".parse().unwrap();
    let day = product_day_key(submission);
    let puzzle: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO daily_puzzles (game_slug, puzzle_date, puzzle_data, solution, difficulty)
         VALUES ('sudoku', $1, '{}'::jsonb, '{}'::jsonb, 'medium') RETURNING id",
    )
    .bind(day.and_hms_opt(0, 0, 0).unwrap())
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    let user_id = uuid::Uuid::now_v7().to_string();
    let puzzle_id = puzzle.to_string();
    let session = |puzzle_id| ValidatedSession {
        user_id: &user_id,
        game_slug: "sudoku",
        difficulty: Some("medium"),
        mode: "daily",
        status: "won",
        score: Some(80),
        attempts: 2,
        time_spent_ms: 61_000,
        puzzle_id,
        puzzle_date: Some(day),
        day_key: Some(day),
        at_ms: submission.timestamp_millis(),
        hints_used: None,
        comparison_excluded: false,
    };
    let id = persist_validated_session_on_connection(&mut tx, session(Some(&puzzle_id)))
        .await
        .unwrap();
    assert_eq!(
        persist_validated_session_on_connection(&mut tx, session(Some(&puzzle_id))).await,
        Err("already_played".to_string())
    );
    let mut savepoint = tx.begin().await.unwrap();
    assert_eq!(
        persist_validated_session_on_connection(&mut savepoint, session(None)).await,
        Err("already_played".to_string())
    );
    savepoint.rollback().await.unwrap();

    let rows: Vec<(uuid::Uuid, bool, String, bool)> = sqlx::query_as(
        "SELECT id, completed_at = transaction_timestamp() AT TIME ZONE 'UTC', day_key, is_ritual
         FROM game_sessions WHERE user_id = $1",
    )
    .bind(uuid::Uuid::parse_str(&user_id).unwrap())
    .fetch_all(&mut *tx)
    .await
    .unwrap();
    let [(same_id, stored_utc, day_key, is_ritual)] = rows.as_slice() else {
        panic!("expected one finish after both replays, got {rows:?}");
    };
    assert_eq!(same_id.to_string(), id);
    assert!(
        stored_utc,
        "validated writer must store the UTC transaction clock"
    );
    assert_eq!(day_key, "2026-11-28");
    assert!(is_ritual);
    tx.commit().await.unwrap();
}

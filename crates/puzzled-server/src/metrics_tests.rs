//! Aggregate acceptance against migrated Postgres; no production rows.
use crate::{capabilities::metrics, test_support::fresh_database};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

mod admission;

fn time(raw: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(raw)
        .unwrap()
        .with_timezone(&Utc)
}

#[tokio::test]
async fn a_delayed_audience_observation_does_not_recreate_an_erased_account() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let user = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO auth_subjects (subject,user_id) VALUES ('metrics-erasure-fixture',$1)",
    )
    .bind(user)
    .execute(&pool)
    .await
    .unwrap();
    metrics::audience(&pool, &user.to_string(), false).await;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM metric_audiences WHERE user_id=$1")
        .bind(user)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let mut tx = pool.begin().await.unwrap();
    crate::capabilities::identity_access::adapters::guest_credentials::lock_players(
        &mut tx,
        vec![user],
    )
    .await
    .unwrap();
    sqlx::query("DELETE FROM metric_audiences WHERE user_id=$1")
        .bind(user)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("DELETE FROM auth_subjects WHERE user_id=$1")
        .bind(user)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    metrics::audience(&pool, &user.to_string(), true).await;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM metric_audiences WHERE user_id=$1")
        .bind(user)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
async fn finish(
    pool: &PgPool,
    user: Uuid,
    day: &str,
    game: &str,
    ritual: bool,
    class: &str,
    status: &str,
) {
    sqlx::query("INSERT INTO game_sessions (user_id,game_slug,day_key,is_ritual,module_class,status,completed_at) VALUES ($1,$2,$3,$4,$5,$6::game_status,$7::text::timestamp)")
        .bind(user).bind(game).bind(day).bind(ritual).bind(class).bind(status).bind(format!("{day} 04:00:00")).execute(pool).await.unwrap();
}

#[tokio::test]
async fn rollup_matches_the_oracles_and_keeps_closed_cohort_and_landing_semantics() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let a = Uuid::now_v7();
    let b = Uuid::now_v7();
    let visitor = Uuid::now_v7();
    for day in [
        "2026-10-18",
        "2026-10-20",
        "2026-10-21",
        "2026-10-23",
        "2026-10-25",
    ] {
        finish(&pool, a, day, "sudoku", true, "puzzle_ritual", "won").await;
    }
    finish(
        &pool,
        b,
        "2026-10-18",
        "sudoku",
        true,
        "puzzle_ritual",
        "won",
    )
    .await;
    // Multiple games count once; terminal loss counts, archive/practice/nonterminal/oracle do not.
    finish(
        &pool,
        a,
        "2026-10-25",
        "word-guess",
        true,
        "puzzle_ritual",
        "lost",
    )
    .await;
    for (game, ritual, class, status) in [
        ("practice", false, "puzzle_ritual", "won"),
        ("archive", false, "puzzle_ritual", "won"),
        ("oracle", true, "entertainment_oracle", "won"),
        ("started", true, "puzzle_ritual", "in_progress"),
    ] {
        finish(&pool, b, "2026-10-25", game, ritual, class, status).await;
    }
    finish(
        &pool,
        visitor,
        "2026-10-25",
        "sudoku",
        true,
        "puzzle_ritual",
        "won",
    )
    .await;
    sqlx::query("INSERT INTO auth_subjects (subject,user_id) VALUES ('test-account',$1)")
        .bind(a)
        .execute(&pool)
        .await
        .unwrap();
    let share = Uuid::now_v7();
    sqlx::query("INSERT INTO result_shares (id,user_id,game_slug,day_key,status,attempts) VALUES ($1,$2,'sudoku','2026-10-25','won',1)").bind(share).bind(a).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO share_landings (user_id,share_id,day_key,landed_at) VALUES ($1,$3,'2026-10-25','2026-10-25T03:00:00Z'), ($2,$3,'2026-10-25','2026-10-25T05:00:00Z')")
        .bind(visitor).bind(a).bind(share).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO funnel_events (id,event,occurred_at) VALUES ($1,'share_landing','2026-10-24T16:00:00Z'),($2,'share_landing','2026-10-25T15:59:59Z'),($3,'share_landing','2026-10-25T16:00:00Z')").bind(Uuid::now_v7()).bind(Uuid::now_v7()).bind(Uuid::now_v7()).execute(&pool).await.unwrap();
    let now = time("2026-10-25T16:17:00Z"); // HK day 26, day 25 closed.
    assert_eq!(metrics::rollup(&pool, now).await.unwrap(), 35);
    let reports = metrics::reports(&pool).await.unwrap();
    let today = &reports[0].0;
    assert_eq!(today.day_key, "2026-10-26");
    assert!(!today.complete);
    let d = &reports[1].0;
    assert!(d.complete);
    assert_eq!(
        (
            d.daily_puzzle_completers,
            d.signed_in_completers,
            d.daily_entertainment_completers
        ),
        (2, 1, 1)
    );
    assert_eq!((d.weekly_ritualists, d.d7_cohort, d.d7_returned), (1, 2, 1));
    assert_eq!((d.share_landings, d.share_landing_completers), (2, 1));
    use puzzled_core::puzzle_play::ritual_completion::{DRC_RECOMPUTE_SQL, HRC_RECOMPUTE_SQL};
    let drc: i64 = sqlx::query_scalar(DRC_RECOMPUTE_SQL)
        .bind("2026-10-25")
        .fetch_one(&pool)
        .await
        .unwrap();
    let hrc: i64 = sqlx::query_scalar(HRC_RECOMPUTE_SQL)
        .bind("2026-10-25")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!((d.daily_puzzle_completers, d.weekly_ritualists), (drc, hrc));
    let encoded = serde_json::to_string(d).unwrap();
    assert!(!encoded.contains(&a.to_string()) && !encoded.contains(&visitor.to_string()));
    metrics::rollup(&pool, now).await.unwrap();
    assert_eq!(metrics::reports(&pool).await.unwrap().len(), 35);
    // At HK 00:02 the previous day has not yet had its late-event allowance.
    metrics::rollup(&pool, time("2026-10-25T16:02:00Z"))
        .await
        .unwrap();
    assert!(!metrics::reports(&pool).await.unwrap()[1].0.complete);
}

#[tokio::test]
async fn rollup_excludes_marked_finishes_from_product_metrics_not_the_player() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let normal = Uuid::now_v7();
    let harness = Uuid::now_v7();
    let mixed = Uuid::now_v7();
    let registered_fixture = Uuid::now_v7();
    for day in [
        "2026-10-18",
        "2026-10-20",
        "2026-10-21",
        "2026-10-23",
        "2026-10-25",
    ] {
        finish(&pool, normal, day, "sudoku", true, "puzzle_ritual", "won").await;
        finish(&pool, harness, day, "sudoku", true, "puzzle_ritual", "won").await;
    }
    // A marked finish must not start a cohort or make a later real finish ineligible.
    finish(
        &pool,
        mixed,
        "2026-10-18",
        "sudoku",
        true,
        "puzzle_ritual",
        "won",
    )
    .await;
    finish(
        &pool,
        normal,
        "2026-10-25",
        "oracle",
        true,
        "entertainment_oracle",
        "won",
    )
    .await;
    finish(
        &pool,
        harness,
        "2026-10-25",
        "oracle",
        true,
        "entertainment_oracle",
        "won",
    )
    .await;
    sqlx::query(
        "UPDATE game_sessions SET comparison_excluded = true WHERE user_id = $1 OR user_id = $2",
    )
    .bind(harness)
    .bind(mixed)
    .execute(&pool)
    .await
    .unwrap();
    finish(
        &pool,
        mixed,
        "2026-10-25",
        "sudoku",
        true,
        "puzzle_ritual",
        "won",
    )
    .await;
    sqlx::query("INSERT INTO synthetic_fixtures (user_id, fixture_key, auth_subject, synthetic_time) VALUES ($1, 'rollup-fixture', 'rollup-fixture-subject', now())")
        .bind(registered_fixture).execute(&pool).await.unwrap();
    finish(
        &pool,
        registered_fixture,
        "2026-10-25",
        "sudoku",
        true,
        "puzzle_ritual",
        "won",
    )
    .await;

    metrics::rollup(&pool, time("2026-11-01T16:17:00Z"))
        .await
        .unwrap();
    let reports = metrics::reports(&pool).await.unwrap();
    let report = |day| &reports.iter().find(|(r, _)| r.day_key == day).unwrap().0;
    assert_eq!(report("2026-10-18").daily_puzzle_completers, 1);
    let day = report("2026-10-25");
    assert_eq!(day.daily_puzzle_completers, 2);
    assert_eq!(day.daily_entertainment_completers, 1);
    assert_eq!(day.weekly_ritualists, 1);
    assert_eq!((day.d7_cohort, day.d7_returned), (1, 1));
    // The mixed player's genuine first finish seeds a cohort seven days later.
    assert_eq!(report("2026-11-01").d7_cohort, 1);

    use puzzled_core::puzzle_play::ritual_completion::{DRC_RECOMPUTE_SQL, HRC_RECOMPUTE_SQL};
    for (sql, count) in [
        (DRC_RECOMPUTE_SQL, day.daily_puzzle_completers),
        (HRC_RECOMPUTE_SQL, day.weekly_ritualists),
    ] {
        let recomputed: i64 = sqlx::query_scalar(sql)
            .bind(&day.day_key)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(recomputed, count);
    }
}

#[tokio::test]
async fn landings_are_deduplicated_foreign_only_adopted_and_not_finishes() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let owner = Uuid::now_v7();
    let guest = Uuid::now_v7();
    let account = Uuid::now_v7();
    let share = Uuid::now_v7();
    sqlx::query("INSERT INTO result_shares (id,user_id,game_slug,day_key,status,attempts) VALUES ($1,$2,'sudoku','2026-10-25','won',1)").bind(share).bind(owner).execute(&pool).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    assert!(!metrics::landing_on(&mut tx, owner, share).await.unwrap());
    assert!(!metrics::landing_on(&mut tx, guest, Uuid::now_v7())
        .await
        .unwrap());
    assert!(metrics::landing_on(&mut tx, guest, share).await.unwrap());
    assert!(!metrics::landing_on(&mut tx, guest, share).await.unwrap());
    metrics::adopt(&mut tx, account, guest).await.unwrap();
    assert!(!metrics::landing_on(&mut tx, account, share).await.unwrap());
    tx.commit().await.unwrap();
    let users: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM share_landings")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(users, vec![account]);
    let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sessions, 0);
    // The same erasure inventory used by account deletion removes these receipts.
    let mut tx = pool.begin().await.unwrap();
    for (table, _, sql) in
        crate::capabilities::preferences::adapters::account_deletion::USER_KEYED_COLUMNS
    {
        if *table == "share_landings" || *table == "metric_audiences" {
            sqlx::query(*sql)
                .bind(account)
                .execute(&mut *tx)
                .await
                .unwrap();
        }
    }
    tx.commit().await.unwrap();
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM share_landings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}

#[tokio::test]
async fn alerts_are_durable_emitted_once_per_day_and_rollup_retries_do_not_duplicate_them() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    sqlx::query("INSERT INTO metric_counters (day_key,event,count) VALUES ('2026-10-25','share',20), ('2026-10-25','free_finish_failed',5)").execute(&pool).await.unwrap();
    let now = time("2026-10-25T16:17:00Z");
    metrics::rollup(&pool, now).await.unwrap();
    metrics::rollup(&pool, now).await.unwrap();
    let alerts: Vec<(String, bool)> = sqlx::query_as(
        "SELECT signal, emitted_at IS NOT NULL FROM metric_alert_outbox ORDER BY signal",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        alerts,
        vec![
            ("free_finish_errors".into(), true),
            ("shares_without_landings".into(), true)
        ]
    );
    let d = &metrics::reports(&pool).await.unwrap()[1].0;
    assert_eq!(d.alerts.len(), 2);
}

#[tokio::test]
async fn a_missed_day_is_alerted_when_the_schedule_resumes() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    sqlx::query("INSERT INTO metric_counters (day_key,event,count) VALUES ('2026-10-23','share',20), ('2026-10-24','free_finish_failed',5)")
        .execute(&pool).await.unwrap();
    // First tick after an outage: neither violation occurred yesterday.
    let now = time("2026-10-25T16:17:00Z");
    metrics::rollup(&pool, now).await.unwrap();
    metrics::rollup(&pool, now).await.unwrap();
    let alerts: Vec<(String, String, bool)> = sqlx::query_as(
        "SELECT day_key, signal, emitted_at IS NOT NULL FROM metric_alert_outbox ORDER BY day_key, signal",
    ).fetch_all(&pool).await.unwrap();
    assert_eq!(
        alerts,
        vec![
            ("2026-10-23".into(), "shares_without_landings".into(), true),
            ("2026-10-24".into(), "free_finish_errors".into(), true),
        ]
    );
}

#[tokio::test]
async fn the_oldest_visible_day_keeps_its_alert_comparison_context() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    for _ in 0..20 {
        finish(
            &pool,
            Uuid::now_v7(),
            "2026-09-21",
            "sudoku",
            true,
            "puzzle_ritual",
            "won",
        )
        .await;
    }
    metrics::rollup(&pool, time("2026-10-25T16:17:00Z"))
        .await
        .unwrap();
    let rows = metrics::reports(&pool).await.unwrap();
    assert_eq!(rows.len(), 35);
    let (oldest, _) = rows.last().unwrap();
    assert_eq!(oldest.day_key, "2026-09-22");
    assert!(oldest.alerts.contains(&"completers_drop".into()));
}

#[tokio::test]
#[rustfmt::skip]
async fn first_finish_cohorts_count_once_by_entry_identity_and_never_invent_zeros() {
    let Some(pool) = fresh_database().await else { return };
    let [guest, claimed, account, signed_in, legacy, fixture, comparison] = std::array::from_fn(|_| Uuid::now_v7());
    let q = sqlx::query::<sqlx::Postgres>;
    // A report stored before cohorts existed is not collected, not zero.
    q("INSERT INTO metric_days (id,day_key,report) VALUES ($1,'2026-09-01',$2::jsonb)").bind(Uuid::now_v7()).bind(r#"{"day_key":"2026-09-01","complete":true,"daily_puzzle_completers":0,"signed_in_completers":0,"daily_entertainment_completers":0,"weekly_ritualists":0,"d7_cohort":0,"d7_returned":0,"share_landings":0,"share_landing_completers":0,"shares":0,"free_finish_ok":0,"free_finish_failed":0,"paid_active":0,"paid_completers":0,"free_active":0,"free_completers":0,"catalog_size":0,"release":"","alerts":[]}"#).execute(&pool).await.unwrap();
    let stored = metrics::reports(&pool).await.unwrap();
    assert!(stored[0].0.complete && stored[0].0.cohorts.is_none());
    for (user, adopted) in [(guest, None), (claimed, Some(account))] {
        q("INSERT INTO guest_credentials (token_hash,user_id,provenance,adopted_user_id,revoked_at,revocation_reason) SELECT 'h-'||$1::text,$1,'server_issued',$2,CASE WHEN $2 IS NULL THEN NULL ELSE now() END,CASE WHEN $2 IS NULL THEN NULL ELSE 'adopted' END")
            .bind(user).bind(adopted).execute(&pool).await.unwrap();
    }
    for user in [account, signed_in] {
        q("INSERT INTO auth_subjects (subject,user_id) VALUES ('s-'||$1::text,$1)").bind(user).execute(&pool).await.unwrap();
    }
    q("INSERT INTO synthetic_fixtures (user_id,fixture_key,auth_subject,synthetic_time) VALUES ($1,'cohort-fixture','cohort-fixture-subject',now())").bind(fixture).execute(&pool).await.unwrap();
    // Paid status is not identity: a paid signed-in player is an ordinary member.
    q("INSERT INTO metric_audiences (user_id,day_key,paid) VALUES ($1,'2026-10-24',true)").bind(signed_in).execute(&pool).await.unwrap();
    // The claimed guest finishes two games on day zero (one member), is
    // adopted, and returns at HK 01:30 on the 25th (still the 24th in UTC).
    // A comparison finish neither starts a cohort nor counts as a return.
    let rows = [
        (account, "2026-10-24", "sudoku", "2026-10-24 02:00", Some(claimed), false),
        (account, "2026-10-24", "word-guess", "2026-10-24 15:59", Some(claimed), false),
        (account, "2026-10-25", "sudoku", "2026-10-24 17:30", None, false),
        (guest, "2026-10-24", "sudoku", "2026-10-24 03:00", None, false),
        (guest, "2026-10-26", "sudoku", "2026-10-25 17:00", None, false),
        (signed_in, "2026-10-24", "sudoku", "2026-10-24 03:00", None, false),
        (signed_in, "2026-10-25", "sudoku", "2026-10-25 03:00", None, false),
        (legacy, "2026-10-24", "sudoku", "2026-10-24 03:00", None, false),
        (fixture, "2026-10-24", "sudoku", "2026-10-24 03:00", None, false),
        (fixture, "2026-10-25", "sudoku", "2026-10-25 03:00", None, false),
        (comparison, "2026-10-24", "sudoku", "2026-10-24 03:00", None, true),
        (comparison, "2026-10-25", "sudoku", "2026-10-25 03:00", None, false),
    ];
    for (user, day, game, at, adopted, excluded) in rows {
        q("INSERT INTO game_sessions (user_id,game_slug,day_key,is_ritual,module_class,status,completed_at,adopted_from_guest,comparison_excluded) VALUES ($1,$2,$3,true,'puzzle_ritual','won',$4::text::timestamp,$5,$6)")
            .bind(user).bind(game).bind(day).bind(at).bind(adopted).bind(excluded).execute(&pool).await.unwrap();
    }
    metrics::rollup(&pool, time("2026-10-25T16:17:00Z")).await.unwrap();
    let reports = metrics::reports(&pool).await.unwrap();
    let day = |key: &str| reports.iter().find(|(d, _)| d.day_key == key).unwrap().0.clone();
    let c = |key: &str| day(key).cohorts.unwrap();
    let zero = c("2026-10-24");
    assert_eq!((zero.first_completers, zero.first_guest_entry, zero.first_signed_in_entry, zero.first_guest_entry_now_signed_in), (4, 2, 1, 1));
    assert_eq!(day("2026-10-24").daily_puzzle_completers, 4);
    let one = c("2026-10-25");
    assert_eq!((one.d1_cohort, one.d1_returned, one.d1_cohort_guest_entry, one.d1_returned_guest_entry), (4, 2, 2, 1));
    assert_eq!((one.first_completers, day("2026-10-25").d7_cohort), (1, 0));
    // Computed empty is present zeros; today is present but provisional.
    assert!(day("2026-10-20").complete && c("2026-10-20") == Default::default());
    assert!(!day("2026-10-26").complete && (c("2026-10-26").d1_cohort, c("2026-10-26").d1_returned) == (1, 0));
}

#[tokio::test]
#[rustfmt::skip]
async fn guest_starts_use_first_adopted_pick_and_only_convert_on_the_same_game_and_hk_day() {
    use crate::capabilities::identity_access::adapters::platform_jwt::VerifiedIdentity;
    use crate::capabilities::puzzle_play::adapters::game_sessions_db::adopt_guest_sessions;
    let Some(pool) = fresh_database().await else { return };
    let q = sqlx::query::<sqlx::Postgres>;
    let day = "2026-10-25";
    let [adopted, guest, duplicate_guest, earlier, earlier_guest, synthetic, synthetic_guest, loose, wrong_game, wrong_day, prior_finish, unknown, implicit, excluded, tied, signed, late, comparison, old, mixed] = std::array::from_fn(|_| Uuid::now_v7());
    let pick = "INSERT INTO daily_free_picks (user_id,day_key,game_slug,started_at,claimed_via,guest_entry,comparison_excluded) VALUES ($1,$2::text::date,$3,$4::text::timestamptz,$5,$6,$7)";
    let done = "INSERT INTO game_sessions (user_id,game_slug,day_key,is_ritual,module_class,status,completed_at,comparison_excluded,completed_at_utc) VALUES ($1,$2,$3,true,'puzzle_ritual','won',$4::text::timestamp,$5,$6::text::timestamptz)";
    let start_at = "2026-10-24T22:00:00Z";
    for user in [guest, earlier_guest, synthetic_guest, wrong_game, wrong_day, prior_finish, unknown, implicit, excluded, tied, late, comparison] {
        q(pick).bind(user).bind(day).bind("sudoku").bind(start_at).bind("start").bind(true).bind(false).execute(&pool).await.unwrap();
    }
    for (user, d, game, at, via, guest_entry, flag) in [
        (old, "2026-10-24", "sudoku", "2026-10-24T02:00:00Z", Some("start"), true, false),
        (unknown, "2026-08-01", "sudoku", "2026-08-01T00:00:00Z", None, true, false),
        (implicit, day, "crossword", "2026-10-24T21:00:00Z", Some("guess"), true, false),
        (excluded, day, "crossword", "2026-10-24T21:00:00Z", Some("start"), true, true),
        (tied, day, "crossword", start_at, Some("finish"), true, false),
        (signed, day, "sudoku", start_at, Some("start"), false, false),
        (adopted, day, "sudoku", "2026-10-24T23:00:00Z", Some("start"), false, false),
        (mixed, "2026-10-26", "sudoku", "2026-10-25T18:00:00Z", Some("start"), true, false),
    ] {
        q(pick).bind(user).bind(d).bind(game).bind(at).bind(via).bind(guest_entry).bind(flag).execute(&pool).await.unwrap();
    }
    // Old writer with partial provenance, on an otherwise eligible later day.
    q(pick).bind(Uuid::now_v7()).bind("2026-10-26").bind("sudoku").bind("2026-10-25T20:00:00Z").bind("start").bind(true).bind(None::<bool>).execute(&pool).await.unwrap();
    let after = Some("2026-10-24T23:00:00Z");
    let before = Some("2026-10-24T21:00:00Z");
    let tie = Some("2026-10-25T06:00:00+08:00");
    for (user, game, d, excluded, instant) in [
        (adopted, "sudoku", day, true, None),
        (guest, "sudoku", day, false, tie), // Same instant, retained after adoption.
        (duplicate_guest, "sudoku", day, false, after),
        (earlier, "crossword", day, true, None),
        (earlier_guest, "crossword", day, false, before),
        (earlier, "sudoku", day, false, None), // Trusted earlier finish wins over NULL.
        (synthetic_guest, "sudoku", day, false, None),
        (loose, "sudoku", day, false, None), // Unrelated to any pick identity.
        (wrong_game, "crossword", day, false, tie),
        (wrong_day, "sudoku", "2026-10-26", false, tie),
        (prior_finish, "sudoku", "2026-10-28", false, before), // Ignore stored day for order.
        (comparison, "sudoku", day, true, None),
        (unknown, "sudoku", day, false, None), // Earlier pick already excludes this player.
    ] {
        q(done).bind(user).bind(game).bind(d).bind("2026-10-24 23:00").bind(excluded).bind(instant).execute(&pool).await.unwrap();
    }
    q("INSERT INTO synthetic_fixtures (user_id,fixture_key,auth_subject,synthetic_time) VALUES ($1,'synthetic-guest-start','synthetic-guest-start',now())").bind(synthetic_guest).execute(&pool).await.unwrap();
    for (account, former_guest) in [(adopted, guest), (adopted, duplicate_guest), (earlier, earlier_guest), (synthetic, synthetic_guest)] {
        q("INSERT INTO auth_subjects (subject,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING").bind(format!("s-{account}")).bind(account).execute(&pool).await.unwrap();
        let hash = format!("h-{former_guest}");
        q("INSERT INTO guest_credentials (token_hash,user_id,provenance) VALUES ($1,$2,'server_issued')").bind(&hash).bind(former_guest).execute(&pool).await.unwrap();
        let id = VerifiedIdentity { user_id: account.to_string(), display_name: None, email: None, actor: None };
        // Only the synthetic finish physically moves; collisions keep guest rows.
        assert_eq!(adopt_guest_sessions(&pool, &id, &format!("guest_{former_guest}"), &hash).await.unwrap(), u64::from(account == synthetic));
    }
    let tick = |now, marker| metrics::rollup_with_guest_start_boundary(&pool, time(now), marker);
    let marker = Some("2026-10-23T18:00:00Z"); // HK Oct 24; first full day is Oct 25.
    let before_close = "2026-10-25T16:09:00Z"; // HK Oct 26 at 00:09.
    for refused in [None, Some("bad value"), Some("2026-10-26T00:00:00Z")] {
        assert_eq!(tick(before_close, refused).await.unwrap(), 35);
        let reports = metrics::reports(&pool).await.unwrap();
        assert!(reports.iter().all(|(d, _)| d.guest_start_cohort.is_none()));
        assert!(reports.iter().any(|(d, _)| d.daily_puzzle_completers > 0 && d.cohorts.is_some()));
    }
    let baseline = metrics::reports(&pool).await.unwrap();
    tick(before_close, marker).await.unwrap();
    let reports = metrics::reports(&pool).await.unwrap();
    assert_eq!(reports.len(), baseline.len());
    for ((b, _), (a, _)) in baseline.iter().zip(&reports) {
        let mut a = serde_json::to_value(a).unwrap();
        a.as_object_mut().unwrap().remove("guest_start_cohort");
        assert_eq!(a, serde_json::to_value(b).unwrap(), "{}", b.day_key);
    }
    let cohort = |key: &'static str| {
        let pool = &pool;
        async move {
            let reports = metrics::reports(pool).await.unwrap();
            let (d, _) = reports.into_iter().find(|(d, _)| d.day_key == key).unwrap();
            (d.complete, d.guest_start_cohort.map(|c| (c.started, c.completed_same_day)))
        }
    };
    assert_eq!(cohort(day).await, (false, Some((5, 1))));
    // A trusted finish becomes visible during grace, after HK midnight;
    // conversion still uses the stored product day, not the instant's HK date.
    q(done).bind(late).bind("sudoku").bind(day).bind("2026-10-25 16:01").bind(false).bind(Some("2026-10-25T16:01:00Z")).execute(&pool).await.unwrap();
    tick("2026-10-25T16:17:00Z", marker).await.unwrap();
    assert_eq!(cohort(day).await, (true, Some((5, 2))));
    tick("2026-10-27T16:17:00Z", marker).await.unwrap();
    assert_eq!(cohort("2026-10-23").await, (true, None)); // empty before collection
    assert_eq!(cohort("2026-10-24").await, (true, None)); // eligible row on rollout day
    assert_eq!(cohort("2026-10-26").await, (true, None)); // mixed despite eligible row
    assert_eq!(cohort("2026-10-27").await, (true, Some((0, 0))));
}

#[tokio::test]
#[rustfmt::skip]
async fn only_unresolved_finish_order_for_an_eligible_pick_hides_the_whole_product_day() {
    let Some(pool) = fresh_database().await else { return };
    let q = sqlx::query::<sqlx::Postgres>;
    let pick = "INSERT INTO daily_free_picks (user_id,day_key,game_slug,started_at,claimed_via,guest_entry,comparison_excluded) VALUES ($1,$2::text::date,'sudoku',$3::text::timestamptz,'start',true,false)";
    let done = "INSERT INTO game_sessions (user_id,game_slug,day_key,is_ritual,module_class,status,completed_at,completed_at_utc) VALUES ($1,$2,$3,true,'puzzle_ritual','won','2026-10-25 07:00',$4::text::timestamptz)";
    let [early, late, clean, unresolved] = std::array::from_fn(|_| Uuid::now_v7());
    let report = |day: &'static str| {
        let pool = &pool;
        async move {
            let now = time("2026-10-28T00:00:00Z");
            metrics::rollup_with_guest_start_boundary(pool, now, Some("2026-10-24T00:00:00Z")).await.unwrap();
            let reports = metrics::reports(pool).await.unwrap();
            let (d, _) = reports.into_iter().find(|(d, _)| d.day_key == day).unwrap();
            assert!(d.complete);
            d.guest_start_cohort.map(|c| (c.started, c.completed_same_day))
        }
    };
    let day = "2026-10-25";
    let start = "2026-10-24T22:00:00Z";
    q(pick).bind(early).bind(day).bind(start).execute(&pool).await.unwrap();
    q(done).bind(early).bind("sudoku").bind(day).bind(Some("2026-10-24T21:59:59Z")).execute(&pool).await.unwrap();
    assert_eq!(report(day).await, Some((0, 0)));

    // Identical legacy clocks and day/game labels, opposite order relative to the pick.
    q(pick).bind(late).bind(day).bind(start).execute(&pool).await.unwrap();
    q(done).bind(late).bind("sudoku").bind(day).bind(Some("2026-10-24T22:00:01Z")).execute(&pool).await.unwrap();
    assert_eq!(report(day).await, Some((1, 1)));

    let next = "2026-10-26";
    let next_start = "2026-10-25T22:00:00Z";
    q(pick).bind(clean).bind(next).bind(next_start).execute(&pool).await.unwrap();
    q(done).bind(clean).bind("sudoku").bind(next).bind(Some("2026-10-25T23:00:00Z")).execute(&pool).await.unwrap();
    assert_eq!(report(next).await, Some((1, 1)));

    // Without the trusted instant, even a later stored day and a different game
    // can't resolve order. The whole day is absent, not the remaining (1, 1).
    q(pick).bind(unresolved).bind(next).bind(next_start).execute(&pool).await.unwrap();
    q(done).bind(unresolved).bind("crossword").bind("2026-10-27").bind(None::<&str>).execute(&pool).await.unwrap();
    assert_eq!(report(next).await, None);
    let rows = q(include_str!("capabilities/metrics/rollup.sql"))
        .bind("2026-10-25").bind("2026-10-27").bind(time("2026-10-25T00:00:00Z").date_naive())
        .fetch_all(&pool).await.unwrap();
    use sqlx::Row;
    let row = rows.iter().find(|row| row.get::<&str, _>("day_key") == next).unwrap();
    assert_eq!(row.get::<Option<i64>, _>("guest_starts"), None);
    assert_eq!(row.get::<Option<i64>, _>("guest_start_completed_same_day"), None);
    let stored: serde_json::Value = sqlx::query_scalar("SELECT report FROM metric_days WHERE day_key = $1")
        .bind(next).fetch_one(&pool).await.unwrap();
    assert!(!stored.as_object().unwrap().contains_key("guest_start_cohort"));
    assert_eq!(report(day).await, Some((1, 1)));
    assert_eq!(report("2026-10-27").await, Some((0, 0)));
}

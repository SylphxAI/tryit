//! Read the exact Ops query against migrated Postgres, not a copy of its predicate.
use axum::http::StatusCode;
use puzzled_core::puzzle_play::daily_time::product_day_key;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use super::{fresh_database, post_event};
use crate::capabilities::identity_access::adapters::guest_credentials;

async fn counts(pool: &PgPool, day: &str, case: &str, expected: &[(&str, &str, &str, &str, i64)]) {
    let rows: Vec<(String, String, String, String, String, i64)> =
        sqlx::query_as(include_str!("../capabilities/funnel/daily_completions.sql"))
            .bind(day)
            .fetch_all(pool)
            .await
            .unwrap();
    let report = rows
        .iter()
        .map(|(actual_day, game, class, status, identity, count)| {
            assert_eq!(actual_day, day);
            (
                game.as_str(),
                class.as_str(),
                status.as_str(),
                identity.as_str(),
                *count,
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(report, expected, "{case}");
    eprintln!("{case}: {report:?}");
}

const GUEST_WIN: (&str, &str, &str, &str, i64) = ("word-guess", "puzzle_ritual", "won", "guest", 1);
const AUTH_LOSS: (&str, &str, &str, &str, i64) =
    ("word-guess", "puzzle_ritual", "lost", "signed_in", 1);

#[tokio::test]
async fn durable_daily_completion_survives_no_callback_and_ignores_client_duplicates() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = crate::router(crate::AppState::new(Some(pool.clone())));
    let day = product_day_key(chrono::Utc::now());
    let puzzle = crate::capabilities::daily_pipeline::resolve(Some(&pool), "word-guess", day, None)
        .await
        .unwrap();
    let day = day.to_string();
    let mut valid = json!({"gameSlug":"word-guess","puzzleDate":day,"status":"won","attempts":1,
        "submissionJson":json!({"guesses":[puzzle.solution["word"]]}).to_string()});
    let cookie = guest_credentials::mint_cookie(None).unwrap();
    let pair = cookie.split(';').next().unwrap();
    let origin = crate::shared::public_origin::public_origin().unwrap();
    let submit = |input: Value, cookie: Option<&str>, auth: Option<&str>, verify: bool| {
        let mut req = axum::http::Request::post("/puzzled.v1.PuzzleService/SubmitGuess")
            .header("content-type", "application/json");
        if let Some(cookie) = cookie {
            req = req.header("cookie", cookie);
        }
        if let Some(jwt) = auth {
            req = req.header("authorization", format!("Bearer {jwt}"));
        }
        if verify {
            req = req.header("x-puzzled-verification", "1");
        }
        tower::ServiceExt::oneshot(
            app.clone(),
            req.body(axum::body::Body::from(input.to_string())).unwrap(),
        )
    };
    let refused = submit(valid.clone(), None, None, false).await.unwrap();
    assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
    counts(&pool, &day, "refused", &[]).await;
    let mut invalid = valid.clone();
    invalid["submissionJson"] = json!("{}");
    let rejected = submit(invalid, Some(pair), None, false).await.unwrap();
    assert_eq!(rejected.status(), StatusCode::OK);
    let body = crate::test_support::body_json(rejected).await;
    assert_ne!(body["valid"], true);
    assert!(body.get("revealJson").is_none());
    counts(&pool, &day, "invalid verdict", &[]).await;

    // Fail after the insert, only at COMMIT, in the disposable test DB.
    sqlx::raw_sql(
        "CREATE FUNCTION fail_finish_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture rollback'; END $$;
      CREATE CONSTRAINT TRIGGER fail_finish_commit AFTER INSERT ON game_sessions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_finish_commit();",
    )
    .execute(&pool)
    .await
    .unwrap();
    let rolled_back = submit(valid.clone(), Some(pair), None, false)
        .await
        .unwrap();
    assert!(rolled_back.status().is_server_error());
    assert!(crate::test_support::body_json(rolled_back)
        .await
        .get("revealJson")
        .is_none());
    counts(&pool, &day, "deferred COMMIT failure", &[]).await;
    sqlx::query("DROP TRIGGER fail_finish_commit ON game_sessions")
        .execute(&pool)
        .await
        .unwrap();

    // Raw RPCs: no guest-status request, no browser, no follow-up callback.
    // Make optional funnel storage unusable to confirm it cannot affect play.
    sqlx::query("ALTER TABLE funnel_events RENAME TO unavailable_funnel_events")
        .execute(&pool)
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        submit(valid.clone(), Some(pair), None, false),
        submit(valid.clone(), Some(pair), None, false)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    let accepted = match (a.status(), b.status()) {
        (StatusCode::OK, StatusCode::CONFLICT) => a,
        (StatusCode::CONFLICT, StatusCode::OK) => b,
        statuses => panic!("exactly one accepted submit expected, got {statuses:?}"),
    };
    // Discard the accepted response body before any client-side handling.
    drop(accepted);
    counts(
        &pool,
        &day,
        "concurrent first submit + response discarded + optional funnel unavailable",
        &[GUEST_WIN],
    )
    .await;
    sqlx::query("ALTER TABLE unavailable_funnel_events RENAME TO funnel_events")
        .execute(&pool)
        .await
        .unwrap();
    let retry = submit(valid.clone(), Some(pair), None, false)
        .await
        .unwrap();
    assert_eq!(retry.status(), StatusCode::CONFLICT);
    for _ in 0..2 {
        let mut request = crate::test_support::build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            axum::body::Body::from(json!({"gameSlug":"word-guess","puzzleDate":day}).to_string()),
        );
        request
            .headers_mut()
            .insert("cookie", pair.parse().unwrap());
        let response = tower::ServiceExt::oneshot(app.clone(), request)
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            crate::test_support::body_json(response).await["hasCompleted"],
            true
        );
    }
    counts(&pool, &day, "serial retry + reopen + refresh", &[GUEST_WIN]).await;

    // An old API could have stored this row before or during rollout. An old
    // web client posting it to the new API gets success without another row.
    sqlx::query(r#"INSERT INTO funnel_events (id,event,game_slug,params) VALUES ($1,'game_complete','word-guess',
      '{"mode":"daily","status":"won","pick_index":1,"is_guest":true,"time_bucket_s":0}')"#)
        .bind(Uuid::now_v7()).execute(&pool).await.unwrap();
    let legacy = json!({"event":"game_complete","gameSlug":"word-guess","mode":"daily","status":"won",
        "isGuest":true,"timeBucketS":0,"pickIndex":1});
    for _ in 0..2 {
        assert_eq!(
            post_event(&app, &origin, "same-origin", &legacy).await,
            StatusCode::OK
        );
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM funnel_events")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    counts(
        &pool,
        &day,
        "legacy stored event + retried wire POSTs",
        &[GUEST_WIN],
    )
    .await;

    // Use the real adoption path. The account mapping already exists, but the
    // moved finish must still be guest-origin and the total must stay one.
    let account = Uuid::now_v7();
    let subject = format!("principal-{account}");
    sqlx::query("INSERT INTO auth_subjects(subject,user_id,created_at) VALUES($1,$2,now()-interval '1 day')")
        .bind(&subject).bind(account).execute(&pool).await.unwrap();
    let jwt = crate::test_support::token(&account.to_string());
    let adopt = crate::test_support::build_connect_request_with_auth(
        "/puzzled.v1.StatsService/GetHistory",
        axum::body::Body::from("{}"),
        &jwt,
    );
    let (mut parts, body) = adopt.into_parts();
    parts.headers.insert("cookie", pair.parse().unwrap());
    let adopt = axum::http::Request::from_parts(parts, body);
    assert_eq!(
        tower::ServiceExt::oneshot(app.clone(), adopt)
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT count(*) FROM game_sessions WHERE user_id=$1 AND adopted_from_guest IS NOT NULL").bind(account).fetch_one(&pool).await.unwrap(), 1);
    counts(
        &pool,
        &day,
        "account adoption preserves guest origin and total",
        &[GUEST_WIN],
    )
    .await;

    let marked = guest_credentials::mint_cookie(None).unwrap();
    let marked = marked.split(';').next().unwrap();
    let response = submit(valid.clone(), Some(marked), None, true)
        .await
        .unwrap();
    assert_eq!(
        crate::test_support::body_json(response).await["valid"],
        true
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM game_sessions WHERE comparison_excluded"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        1
    );
    counts(
        &pool,
        &day,
        "verification-marked finish stored but excluded",
        &[GUEST_WIN],
    )
    .await;

    let fixture = Uuid::now_v7();
    let subject = format!("principal-{fixture}");
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(&subject)
        .bind(fixture)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO synthetic_fixtures(user_id,fixture_key,auth_subject,synthetic_time) VALUES($1,'daily-finish-fixture',$2,now())")
        .bind(fixture).bind(subject).execute(&pool).await.unwrap();
    let jwt = crate::test_support::token(&fixture.to_string());
    let response = submit(valid.clone(), None, Some(&jwt), false)
        .await
        .unwrap();
    assert_eq!(
        crate::test_support::body_json(response).await["valid"],
        true
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM game_sessions WHERE user_id=$1")
            .bind(fixture)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    counts(
        &pool,
        &day,
        "registered fixture finish stored but excluded",
        &[GUEST_WIN],
    )
    .await;

    // A separate known account submits a valid loss with no telemetry callback.
    let player = Uuid::now_v7();
    // The local JWT helper bypasses the upstream Auth session exchange. Seed
    // the same persisted subject mapping that the exchange creates in production.
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{player}"))
        .bind(player)
        .execute(&pool)
        .await
        .unwrap();
    let jwt = crate::test_support::token(&player.to_string());
    let wrong = if puzzle.solution["word"]
        .as_str()
        .unwrap()
        .eq_ignore_ascii_case("crane")
    {
        "slate"
    } else {
        "crane"
    };
    valid["status"] = json!("lost");
    valid["attempts"] = json!(6);
    valid["submissionJson"] = json!(json!({"guesses": vec![wrong; 6]}).to_string());
    let response = submit(valid, None, Some(&jwt), false).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = crate::test_support::body_json(response).await;
    assert_eq!(body["status"], "lost");
    assert!(body["revealJson"].is_string());
    counts(
        &pool,
        &day,
        "authenticated loss, no callback",
        &[AUTH_LOSS, GUEST_WIN],
    )
    .await;
}

#[tokio::test]
async fn durable_daily_completion_keeps_unknown_separate_and_reads_both_ritual_classes() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = "2026-10-25";
    // Historical rows can lack provenance, have evidence created only later,
    // or have conflicting evidence. None supports a signed-in bucket.
    let [no_evidence, late_auth, conflicting, entertainment] = [(); 4].map(|()| Uuid::now_v7());
    sqlx::query(
        "INSERT INTO auth_subjects (subject,user_id,created_at) VALUES
        ('daily-query-late',$1,'2026-10-26'), ('daily-query-conflict',$2,'2026-10-24')",
    )
    .bind(late_auth)
    .bind(conflicting)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO guest_credentials (token_hash,user_id,created_at,provenance)
        VALUES ('daily-query-conflict',$1,'2026-10-24','server_issued')",
    )
    .bind(conflicting)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO game_sessions (user_id, game_slug, day_key, mode, module_class, status, is_ritual, completed_at) VALUES
        ($1,'word-guess',$5,'daily','puzzle_ritual','won',true,'2026-10-25'),
        ($2,'word-guess',$5,'daily','puzzle_ritual','won',true,'2026-10-25'),
        ($3,'word-guess',$5,'daily','puzzle_ritual','won',true,'2026-10-25'),
        ($4,'word-guess',$5,'daily','entertainment_oracle','lost',true,'2026-10-25'),
        ($1,'word-groups',$5,'archive','puzzle_ritual','won',true,'2026-10-25'),
        ($1,'crowns',$5,'daily','puzzle_ritual','won',false,'2026-10-25'),
        ($1,'crossword',$5,'daily','puzzle_ritual','in_progress',true,NULL),
        ($1,'arithmo','2026-10-24','daily','puzzle_ritual','won',true,'2026-10-24')")
        .bind(no_evidence).bind(late_auth).bind(conflicting).bind(entertainment).bind(day)
        .execute(&pool).await.unwrap();
    counts(&pool, day, "unknown + later-only + conflicting, separate entertainment, no archive/unfinished/other day", &[
        ("word-guess", "entertainment_oracle", "lost", "unknown", 1),
        ("word-guess", "puzzle_ritual", "won", "unknown", 3),
    ]).await;
}

use super::support::{bootstrap, puzzle_request};
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn passive_daily_reads_are_boardless_and_concurrent_starts_share_three_picks() {
    use crate::capabilities::money::Money;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let catalog = axum::Router::new().route(
        "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
        axum::routing::get(|| async {
            axum::Json(json!({"spec": {"products": [{
                "key": "solo", "display_name": "Plus", "features": {"plus": "true"},
                "prices": [{"key": "solo_month", "recurring_interval": "month", "unit_amounts": {"USD": "499"}}]
            }]}}))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, catalog).await.unwrap() });
    let money = Money::new(
        &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
        "sk_test",
        "https://tryit.fun",
    );
    let state = AppState::new(Some(pool.clone())).with_money(Some(money));
    assert!(state.sales_open().await);
    let app = router(state);
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let (status, _, cookies) = bootstrap(&app, "https://tryit.fun", None, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let pair = cookies[0].split(';').next().unwrap();
    let request_for = |game| json!({"gameSlug":game,"puzzleDate":day.to_string()});
    for game in ["sudoku", "word-guess", "word-groups", "duo"] {
        let (status, body) = puzzle_request(&app, "GetDaily", pair, None, request_for(game)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["requiresStart"], true);
        assert_eq!(body["puzzleDate"], day.to_string());
        assert!(body.get("puzzleDataJson").is_none());
    }
    let (status, _) = puzzle_request(&app, "StartDaily", "", None, request_for("sudoku")).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, body) = puzzle_request(
        &app,
        "StartDaily",
        pair,
        None,
        json!({"gameSlug":"sudoku","puzzleDate":day.pred_opt().unwrap().to_string()}),
    )
    .await;
    assert!(!status.is_success());
    assert_eq!(body["message"], "daily_date_changed");
    let count = |sql: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(sql)
                .fetch_one(&pool)
                .await
                .unwrap()
        }
    };
    assert_eq!(count("SELECT count(*) FROM guest_credentials").await, 0);
    assert_eq!(count("SELECT count(*) FROM daily_free_picks").await, 0);
    for game in ["sudoku", "sudoku", "word-guess"] {
        let (status, body) =
            puzzle_request(&app, "StartDaily", pair, None, request_for(game)).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["daily"]["puzzleDataJson"]
            .as_str()
            .is_some_and(|data| !data.is_empty()));
        assert_ne!(body["daily"]["requiresStart"], true);
    }
    let (a, b) = tokio::join!(
        puzzle_request(&app, "StartDaily", pair, None, request_for("word-groups")),
        puzzle_request(&app, "StartDaily", pair, None, request_for("duo")),
    );
    assert_ne!(a.0, b.0);
    for (status, body) in [a, b] {
        if status != StatusCode::OK {
            assert_eq!(status, StatusCode::FORBIDDEN);
            assert_eq!(body["message"], "plus_required");
            assert!(body.get("daily").is_none());
        }
    }
    let (status, body) = puzzle_request(&app, "GetDaily", pair, None, request_for("sudoku")).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["puzzleDataJson"]
        .as_str()
        .is_some_and(|data| !data.is_empty()));
    assert_eq!(count("SELECT count(*) FROM guest_credentials").await, 1);
    assert_eq!(count("SELECT count(*) FROM daily_free_picks").await, 3);
    assert_eq!(count("SELECT count(*) FROM game_sessions").await, 0);
    pool.close().await;
}

#[tokio::test]
async fn first_graded_guess_claims_a_pick_and_keeps_one_guess_budget() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    crate::capabilities::daily_pipeline::resolve(Some(&pool), "word-guess", day, None)
        .await
        .unwrap();
    let cookie = guest_credentials::mint_cookie(None).unwrap();
    let pair = cookie.split(';').next().unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    for attempt in 0..7 {
        let (status, _) = puzzle_request(
            &app,
            "CheckGuess",
            pair,
            None,
            json!({"gameSlug":"word-guess","guessJson":"{\"word\":\"crane\"}"}),
        )
        .await;
        assert_eq!(
            status,
            if attempt < 6 {
                StatusCode::OK
            } else {
                StatusCode::TOO_MANY_REQUESTS
            }
        );
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let picks: i64 =
        sqlx::query_scalar("SELECT count(*) FROM daily_free_picks WHERE game_slug = 'word-guess'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(picks, 1);
    pool.close().await;
}

#[tokio::test]
async fn invalid_submit_rolls_back_allocation_and_adoption_until_valid_finish() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let puzzle = crate::capabilities::daily_pipeline::resolve(Some(&pool), "word-guess", day, None)
        .await
        .unwrap();
    let valid = json!({"gameSlug":"word-guess","status":"won","attempts":1,
        "submissionJson":json!({"guesses":[puzzle.solution["word"]]}).to_string()});
    let invalid =
        json!({"gameSlug":"word-guess","status":"won","attempts":1,"submissionJson":"{}"});
    let app = router(AppState::new(Some(pool.clone())));
    let cookie = guest_credentials::mint_cookie(None).unwrap();
    let pair = cookie.split(';').next().unwrap();
    let (status, body) = puzzle_request(&app, "SubmitGuess", pair, None, invalid.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(body["valid"], true); // proto3 JSON omits false
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    // A refused finish spends no free pick either.
    let picks: i64 = sqlx::query_scalar("SELECT count(*) FROM daily_free_picks")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(picks, 0);
    let (status, body) = puzzle_request(&app, "SubmitGuess", pair, None, valid.clone()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["valid"], true);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    // The accepted finish took today's pick for the new guest player.
    let picked: Vec<String> = sqlx::query_scalar(
        "SELECT p.game_slug FROM daily_free_picks p JOIN guest_credentials g ON g.user_id = p.user_id WHERE p.day_key = $1",
    )
    .bind(day)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(picked, vec!["word-guess".to_string()]);

    let cookie = guest_credentials::issue(&pool).await.unwrap();
    let pair = cookie.split(';').next().unwrap();
    let hash = guest_credentials::token_hash(pair.split_once('=').unwrap().1).unwrap();
    let guest = guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .unwrap();
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES($1,'word-guess','won',1,'daily',true,'2026-09-01')")
        .bind(guest).execute(&pool).await.unwrap();
    let bearer = token(&account.to_string());
    let (_, body) = puzzle_request(&app, "SubmitGuess", pair, Some(&bearer), invalid).await;
    assert_ne!(body["valid"], true); // proto3 JSON omits false
    let live: bool = sqlx::query_scalar("SELECT revoked_at IS NULL AND adopted_user_id IS NULL FROM guest_credentials WHERE token_hash=$1")
        .bind(&hash).fetch_one(&pool).await.unwrap();
    assert!(live);
    let (_, body) = puzzle_request(&app, "SubmitGuess", pair, Some(&bearer), valid).await;
    assert_eq!(body["valid"], true);
    let adopted: Option<Uuid> =
        sqlx::query_scalar("SELECT adopted_user_id FROM guest_credentials WHERE token_hash=$1")
            .bind(&hash)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(adopted, Some(account));
    // The signed-in finish took the pick on the account, not the guest.
    let account_picks: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM daily_free_picks WHERE user_id = $1 AND day_key = $2",
    )
    .bind(account)
    .bind(day)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(account_picks, 1);
    let guest_picks: i64 =
        sqlx::query_scalar("SELECT count(*) FROM daily_free_picks WHERE user_id = $1")
            .bind(guest)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(guest_picks, 0);
    pool.close().await;
}

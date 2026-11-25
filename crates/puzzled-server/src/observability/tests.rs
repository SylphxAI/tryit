use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::routing::get;
use axum::Router;
use tower::ServiceExt as _;

use super::event::MAX_FRAMES;
use super::reporter::{observe, MAX_LIMITER_ENTRIES};
use super::{
    client, error_event, run_worker, scrub, Config, ErrorReport, RateLimiter, Reporter,
    QUEUE_CAPACITY, RATE_WINDOW, UNMATCHED_ROUTE,
};

fn config() -> Config {
    Config {
        service: "api".into(),
        release: "abc123".into(),
        environment: Some("production".into()),
    }
}

fn report(kind: &str, message: &str) -> ErrorReport {
    ErrorReport {
        exception_type: kind.into(),
        message: message.into(),
        ..ErrorReport::default()
    }
}

// (a) payload

#[test]
fn payload_carries_service_release_environment_route_kind_message_and_stack() {
    let backtrace = "   0: std::backtrace::Backtrace::force_capture\n             at /rustc/abc/library/std/src/backtrace.rs:1:1\n   1: puzzled_server::capabilities::jobs::run\n             at ./crates/puzzled-server/src/capabilities/jobs.rs:42:9\n   2: tokio::runtime::task::run\n             at /home/u/.cargo/registry/src/index.crates.io-1/tokio-1/src/task.rs:7:3\n";
    let mut r = report("panic", "boom at /x");
    r.route = Some("/jobs/{id}?x=1".into());
    r.file = Some("crates/puzzled-server/src/capabilities/jobs.rs".into());
    r.line = Some(42);
    r.backtrace = Some(backtrace.into());
    let event = error_event(&r, &config());
    assert_eq!(event.service_name, "api");
    assert_eq!(event.release, "abc123");
    assert_eq!(event.exception_type, "panic");
    assert_eq!(event.message, "boom at /x");
    assert_eq!(
        event.tags.get("environment").map(String::as_str),
        Some("production")
    );
    assert_eq!(
        event.tags.get("route").map(String::as_str),
        Some("/jobs/{id}")
    );
    // Infrastructure frame dropped; innermost last; location not duplicated.
    assert_eq!(event.stack_frames.len(), 2);
    let last = &event.stack_frames[1];
    assert_eq!(
        last.function_name,
        "puzzled_server::capabilities::jobs::run"
    );
    assert_eq!(last.line, 42);
    assert!(last.app_frame);
    assert!(!event.stack_frames[0].app_frame);
}

#[test]
fn panic_location_is_kept_when_the_backtrace_has_no_symbols() {
    let mut r = report("panic", "boom");
    r.file = Some("crates/app/src/main.rs".into());
    r.line = Some(12);
    let event = error_event(&r, &config());
    assert_eq!(event.stack_frames.len(), 1);
    assert!(event.stack_frames[0].app_frame);
    assert_eq!(event.stack_frames[0].line, 12);
    assert!(event.fingerprint.is_empty());
}

#[test]
fn server_errors_group_by_route_and_status() {
    let mut a = report("HTTP 500", "POST /jobs/{id} returned 500");
    a.route = Some("/jobs/{id}".into());
    let mut c = a.clone();
    c.exception_type = "HTTP 502".into();
    assert_eq!(
        error_event(&a, &config()).fingerprint,
        "HTTP 500\n/jobs/{id}"
    );
    assert_ne!(
        error_event(&a, &config()).fingerprint,
        error_event(&c, &config()).fingerprint
    );
}

#[test]
fn frames_are_capped() {
    let mut backtrace = String::new();
    for i in 0..120 {
        backtrace.push_str(&format!(
            "  {i}: app::f{i}\n             at ./src/a.rs:{i}:1\n"
        ));
    }
    let mut r = report("panic", "x");
    r.backtrace = Some(backtrace);
    assert_eq!(error_event(&r, &config()).stack_frames.len(), MAX_FRAMES);
}

// (b) scrubbing

#[test]
fn scrub_removes_each_secret_class() {
    // Assemble these synthetic fixtures here so the source contains no complete tokens.
    let jwt_header = "eyJhbGciOiJIUzI1NiJ9";
    let jwt = [jwt_header, "eyJzdWIiOiIxMjM0In0", "abcdefSIG123"].join(".");
    let stripe_live = ["sk", "live", "abcdef123456"].join("_");
    let sylphx_live = format!("sylphx_{stripe_live}");
    let stripe_test = ["pk", "test", "abcdef123456"].join("_");
    let github_token = ["ghp", "abcdefghijklmnop1234"].join("_");
    let cases: &[(&str, &str)] = &[
        ("mail ada@example.com now", "ada@example.com"),
        (
            "Authorization: Bearer abc123def456ghi789",
            "abc123def456ghi789",
        ),
        ("got Bearer zzzzzzzzzzzz1234", "zzzzzzzzzzzz1234"),
        (&format!("jwt {jwt} end"), jwt_header),
        (&format!("key {sylphx_live} used"), &sylphx_live),
        (&format!("key {stripe_live} used"), &stripe_live),
        (&format!("key {stripe_test} used"), &stripe_test),
        (&format!("token {github_token} used"), &github_token),
        ("password=hunter2 next", "hunter2"),
        (r#"{"client_secret":"s3cr3t-value","ok":1}"#, "s3cr3t-value"),
        ("cookie: session=abcdef", "abcdef"),
        (
            "id 0123456789abcdef0123456789abcdef01 end",
            "0123456789abcdef0123456789abcdef01",
        ),
        ("card 4111 1111 1111 1111 declined", "4111 1111 1111 1111"),
        ("card 4111111111111111 declined", "4111111111111111"),
    ];
    for &(input, secret) in cases {
        let out = scrub(input);
        assert!(!out.contains(secret), "{input:?} -> {out:?}");
        assert!(out.contains("[redacted]"), "{input:?} -> {out:?}");
    }
}

#[test]
fn scrub_leaves_ordinary_text() {
    for text in [
        "POST /jobs/{id} returned 500 Internal Server Error",
        "puzzled_server::capabilities::daily_pipeline::run_tick failed after 3 tries",
        "crates/puzzled-server/src/capabilities/daily_pipeline/mod.rs:208",
        "connection refused (os error 111) at 12:30:05",
        "Key::new panicked on empty grid, size 9",
    ] {
        assert_eq!(scrub(text), text);
    }
}

#[test]
fn scrub_reaches_message_tags_and_stack() {
    let mut r = report("HTTP 500", "failed for ada@example.com");
    r.tags = vec![("user".into(), "ada@example.com".into())];
    r.backtrace = Some("  0: app::f\n     at /srv/ada@example.com/a.rs:1:1\n".into());
    let event = error_event(&r, &config());
    assert!(!event.message.contains('@'));
    assert!(event.tags.values().all(|v| !v.contains('@')));
    assert!(event
        .stack_frames
        .iter()
        .all(|f| !f.file_path.contains('@')));
}

// (d) rate limit

#[test]
fn rate_limit_allows_one_per_fingerprint_per_window() {
    let mut limiter = RateLimiter::new(RATE_WINDOW);
    let t0 = Instant::now();
    assert!(limiter.allow("a", t0));
    assert!(!limiter.allow("a", t0 + Duration::from_secs(9)));
    assert!(limiter.allow("b", t0 + Duration::from_secs(9)));
    assert!(limiter.allow("a", t0 + Duration::from_secs(11)));
}

#[test]
fn rate_limit_prunes_stale_entries() {
    let mut limiter = RateLimiter::new(RATE_WINDOW);
    let t0 = Instant::now();
    for i in 0..MAX_LIMITER_ENTRIES {
        assert!(limiter.allow(&i.to_string(), t0));
    }
    assert!(limiter.allow("fresh", t0 + Duration::from_secs(11)));
    assert_eq!(limiter.len(), 1);
}

#[test]
fn reporter_suppresses_repeats_until_the_window_passes() {
    let (reporter, mut rx) = Reporter::with_queue(config(), 8);
    let t0 = Instant::now();
    let same = report("HTTP 500", "GET /a returned 500");
    reporter.report_at(&same, t0);
    reporter.report_at(&same, t0 + Duration::from_secs(5));
    assert_eq!(reporter.suppressed_count(), 1);
    reporter.report_at(&report("panic", "other"), t0 + Duration::from_secs(5));
    reporter.report_at(&same, t0 + Duration::from_secs(10));
    assert_eq!(reporter.suppressed_count(), 1);
    let mut sent = 0;
    while rx.try_recv().is_ok() {
        sent += 1;
    }
    assert_eq!(sent, 3);
}

// (e) bounded queue

#[test]
fn full_queue_drops_without_blocking() {
    let (reporter, _rx) = Reporter::with_queue(config(), 2);
    for i in 0..5 {
        reporter.report(&report(&format!("kind{i}"), "x"));
    }
    assert_eq!(reporter.dropped_count(), 3);
}

// (c) middleware against a fake ingest server

#[derive(Clone, Default)]
struct Fake(Arc<Mutex<Vec<String>>>);

impl Fake {
    fn bodies(&self) -> Vec<String> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

async fn fake_server() -> (Fake, String) {
    let fake = Fake::default();
    let state = fake.clone();
    let app = Router::new().fallback(move |body: axum::body::Bytes| {
        let state = state.clone();
        async move {
            state
                .0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(String::from_utf8_lossy(&body).into_owned());
            axum::Json(serde_json::json!({}))
        }
    });
    let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(error) => panic!("bind fake server: {error}"),
    };
    let url = match listener.local_addr() {
        Ok(addr) => format!("http://{addr}"),
        Err(error) => panic!("fake server address: {error}"),
    };
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    (fake, url)
}

async fn get_status(app: &Router, path: &str) -> StatusCode {
    let request = match axum::http::Request::builder()
        .uri(path)
        .body(axum::body::Body::empty())
    {
        Ok(r) => r,
        Err(error) => panic!("request: {error}"),
    };
    match app.clone().oneshot(request).await {
        Ok(response) => response.status(),
        Err(error) => panic!("oneshot: {error}"),
    }
}

#[tokio::test]
async fn a_500_sends_exactly_one_event_and_a_200_sends_none() {
    let (fake, url) = fake_server().await;
    let Some(client) = client("sylphx_sk_test_key", Some(&url)) else {
        panic!("client not built");
    };
    let (reporter, queue) = Reporter::with_queue(config(), QUEUE_CAPACITY);
    tokio::spawn(run_worker(client, queue));
    let reporter = Arc::new(reporter);
    let app = Router::new()
        .route(
            "/boom/{id}",
            get(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
        )
        .route("/ok", get(|| async { "ok" }))
        .layer(axum::middleware::from_fn(
            move |request: Request, next: Next| {
                let reporter = Arc::clone(&reporter);
                async move { observe(Some(&reporter), request, next).await }
            },
        ));

    assert_eq!(get_status(&app, "/ok").await, StatusCode::OK);
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(fake.bodies().is_empty());

    assert_eq!(
        get_status(&app, "/boom/7?token=abc").await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    for _ in 0..100 {
        if !fake.bodies().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
    let bodies = fake.bodies();
    assert_eq!(bodies.len(), 1, "{bodies:?}");
    assert!(bodies[0].contains("/boom/{id}"), "{}", bodies[0]);
    assert!(bodies[0].contains("abc123"), "{}", bodies[0]);
    assert!(!bodies[0].contains("/boom/7"), "{}", bodies[0]);
}

#[tokio::test]
async fn unmatched_routes_use_the_placeholder() {
    let (reporter, mut rx) = Reporter::with_queue(config(), 8);
    let reporter = Arc::new(reporter);
    let app = Router::new()
        .fallback(|| async { StatusCode::BAD_GATEWAY })
        .layer(axum::middleware::from_fn(
            move |request: Request, next: Next| {
                let reporter = Arc::clone(&reporter);
                async move { observe(Some(&reporter), request, next).await }
            },
        ));
    assert_eq!(
        get_status(&app, "/secret/123?x=1").await,
        StatusCode::BAD_GATEWAY
    );
    let Ok(sent) = rx.try_recv() else {
        panic!("no event queued");
    };
    let Some(event) = sent.error_event else {
        panic!("no event");
    };
    assert_eq!(
        event.tags.get("route").map(String::as_str),
        Some(UNMATCHED_ROUTE)
    );
    assert!(!event.message.contains("/secret"));
}

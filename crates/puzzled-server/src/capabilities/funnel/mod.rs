//! First-party funnel counter. Rows are anonymous (no user id, IP or cookie).
//! Read them with plain SQL, e.g. `SELECT event, count(*) FROM funnel_events GROUP BY 1`.

use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

const METRICS: [&str; 5] = ["LCP", "CLS", "INP", "FCP", "TTFB"];
const RATINGS: [&str; 3] = ["good", "needs-improvement", "poor"];
const MODES: [&str; 3] = ["daily", "archive", "practice"];
const STATUSES: [&str; 2] = ["won", "lost"];
const TIME_BUCKETS_S: [u32; 8] = [0, 30, 60, 120, 300, 600, 1200, 1800];
const PROGRESS_PCT_BUCKETS: [u32; 4] = [0, 25, 50, 75];
const SHARE_ACTIONS: [&str; 3] = ["copy_challenge", "save_png", "native_share"];
const PAYWALL_SURFACES: [&str; 3] = ["4th_game_lock", "archive_lock", "practice_upsell"];
const CURRENCIES: [&str; 16] = [
    "USD", "GBP", "EUR", "HKD", "TWD", "JPY", "KRW", "MYR", "SGD", "CAD", "AUD", "NZD", "THB",
    "PHP", "IDR", "VND",
];
const PWA_PLATFORMS: [&str; 3] = ["chromium", "ios_guide", "other"];
const PUSH_TRIGGERS: [&str; 2] = ["post_win", "settings"];
const PUSH_RESULTS: [&str; 3] = ["granted", "denied", "dismissed"];

/// One event as the browser sends it. Unknown fields are ignored.
#[derive(Debug, Deserialize, Default)]
pub struct Incoming {
    pub event: String,
    pub path: Option<String>,
    pub game_slug: Option<String>,
    pub metric: Option<String>,
    pub value: Option<f64>,
    pub rating: Option<String>,
    pub mode: Option<String>,
    pub status: Option<String>,
    pub pick_index: Option<u32>,
    pub time_bucket_s: Option<u32>,
    pub is_guest: Option<bool>,
    pub progress_pct_bucket: Option<u32>,
    pub hint_count: Option<u32>,
    pub action: Option<String>,
    pub has_percentile: Option<bool>,
    pub surface: Option<String>,
    pub picks_used: Option<u32>,
    pub currency: Option<String>,
    pub platform: Option<String>,
    pub trigger: Option<String>,
    pub result: Option<String>,
}

/// A checked row, ready to store.
#[derive(Debug, PartialEq)]
pub struct Row {
    pub event: &'static str,
    pub path: Option<String>,
    pub game_slug: Option<String>,
    pub metric: Option<&'static str>,
    pub value: Option<f64>,
    pub rating: Option<&'static str>,
    pub params: Option<Value>,
}

fn clean_path(raw: &str) -> Option<String> {
    let path = raw.split(['?', '#']).next()?;
    if !path.starts_with('/') || path.len() > 200 || !path.is_ascii() {
        return None;
    }
    let mut parts = path.trim_matches('/').split('/');
    let first = parts.next().unwrap_or_default();
    let path = if matches!(
        first,
        "en-US" | "en-GB" | "zh-HK" | "zh-CN" | "zh-TW" | "ja" | "es" | "pt-BR"
    ) {
        format!("/{}", parts.collect::<Vec<_>>().join("/"))
    } else {
        path.trim_end_matches('/').to_owned()
    };
    let path = if path.is_empty() { "/" } else { &path };
    if matches!(
        path,
        "/" | "/games"
            | "/pricing"
            | "/privacy"
            | "/terms"
            | "/support"
            | "/login"
            | "/signup"
            | "/delete-account"
    ) {
        return Some(path.to_owned());
    }
    // Never persist arbitrary account/share identifiers or user-entered paths.
    if path.strip_prefix("/games/").is_some_and(is_slug_shaped) {
        return Some("/games/:slug".to_owned());
    }
    None
}

fn is_slug_shaped(raw: &str) -> bool {
    !raw.is_empty()
        && raw.len() <= 64
        && raw
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn canonical_slug(raw: Option<&str>) -> Option<String> {
    raw.filter(|slug| is_valid_game_slug(slug))
        .map(|slug| canonicalize_game_slug(slug).to_owned())
}

fn allowed(value: Option<&str>, options: &'static [&'static str]) -> Option<&'static str> {
    options
        .iter()
        .copied()
        .find(|option| Some(*option) == value)
}

/// Accept only known events and their bounded fields; never retain irrelevant fields.
/// `signup` and `purchase` are not accepted from browsers.
#[must_use]
pub fn validate_browser(incoming: &Incoming) -> Option<Row> {
    let event = match incoming.event.as_str() {
        "landing" => "landing",
        "share_landing" => "share_landing",
        "game_start" => "game_start",
        "web_vitals" => "web_vitals",
        _ => return validate_behavior(incoming),
    };
    let path = incoming.path.as_deref().and_then(clean_path);
    let game_slug = (event == "game_start")
        .then(|| canonical_slug(incoming.game_slug.as_deref()))
        .flatten();
    if event == "game_start" && game_slug.is_none() {
        return None;
    }
    if event != "web_vitals" {
        return Some(Row {
            event,
            path,
            game_slug,
            metric: None,
            value: None,
            rating: None,
            params: None,
        });
    }
    let metric = allowed(incoming.metric.as_deref(), &METRICS)?;
    let value = incoming.value.filter(|v| v.is_finite() && *v >= 0.0)?;
    let rating = allowed(incoming.rating.as_deref(), &RATINGS);
    Some(Row {
        event,
        path,
        game_slug: None,
        metric: Some(metric),
        value: Some(value),
        rating,
        params: None,
    })
}

fn validate_behavior(input: &Incoming) -> Option<Row> {
    let game_slug = || canonical_slug(input.game_slug.as_deref());
    let mode = || allowed(input.mode.as_deref(), &MODES);
    // Build params from scratch so neither unknown input nor fields for other
    // events can reach storage. JSON null is deliberate only for pick_index.
    let (event, game_slug, params) = match input.event.as_str() {
        "game_complete" => {
            if input.pick_index.is_some_and(|n| !(1..=3).contains(&n)) {
                return None;
            }
            (
                "game_complete",
                Some(game_slug()?),
                json!({
                    "mode": mode()?,
                    "status": allowed(input.status.as_deref(), &STATUSES)?,
                    "pick_index": input.pick_index,
                    "time_bucket_s": input.time_bucket_s.filter(|n| TIME_BUCKETS_S.contains(n))?,
                    "is_guest": input.is_guest?,
                }),
            )
        }
        "game_abandon" => (
            "game_abandon",
            Some(game_slug()?),
            json!({
                "mode": mode()?,
                "progress_pct_bucket": input.progress_pct_bucket.filter(|n| PROGRESS_PCT_BUCKETS.contains(n))?,
                "is_guest": input.is_guest?,
            }),
        ),
        "hint_used" => (
            "hint_used",
            Some(game_slug()?),
            json!({ "mode": mode()?, "hint_count": input.hint_count.filter(|n| (1..=100).contains(n))? }),
        ),
        "share_clicked" => (
            "share_clicked",
            Some(game_slug()?),
            json!({
                "action": allowed(input.action.as_deref(), &SHARE_ACTIONS)?,
                "has_percentile": input.has_percentile?,
            }),
        ),
        "paywall_hit" => (
            "paywall_hit",
            Some(game_slug()?),
            json!({
                "surface": allowed(input.surface.as_deref(), &PAYWALL_SURFACES)?,
                "picks_used": input.picks_used.filter(|n| *n <= 3)?,
                "currency": allowed(input.currency.as_deref(), &CURRENCIES)?,
                "is_guest": input.is_guest?,
            }),
        ),
        event @ ("pwa_install_prompted" | "pwa_installed") => (
            if event == "pwa_installed" {
                "pwa_installed"
            } else {
                "pwa_install_prompted"
            },
            None,
            json!({
                "platform": allowed(input.platform.as_deref(), &PWA_PLATFORMS)?,
                "trigger": allowed(input.trigger.as_deref(), &["post_first_win"])?,
            }),
        ),
        "push_opted_in" => (
            "push_opted_in",
            None,
            json!({
                "trigger": allowed(input.trigger.as_deref(), &PUSH_TRIGGERS)?,
                "result": allowed(input.result.as_deref(), &PUSH_RESULTS)?,
            }),
        ),
        _ => return None,
    };
    Some(Row {
        event,
        path: None,
        game_slug,
        metric: None,
        value: None,
        rating: None,
        params: Some(params),
    })
}

pub async fn insert(pool: &PgPool, row: &Row) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO "funnel_events" ("id", "event", "path", "game_slug", "metric", "value", "rating", "params")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
    )
    .bind(uuid::Uuid::now_v7())
    .bind(row.event)
    .bind(&row.path)
    .bind(&row.game_slug)
    .bind(row.metric)
    .bind(row.value)
    .bind(row.rating)
    .bind(&row.params)
    .execute(pool)
    .await
    .map_err(|e| format!("funnel event insert failed: {e}"))?;
    Ok(())
}

/// A new account. Best effort: a failure is logged by the caller, never surfaced.
pub async fn record_signup(pool: &PgPool, user_id: &str) -> Result<(), String> {
    let user_id = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;
    // The receipt and anonymous event commit together; retries/concurrent calls
    // cannot inflate signup counts and a failed insert leaves the call retryable.
    sqlx::query(
        r#"WITH first_signup AS (
            INSERT INTO funnel_signup_receipts (user_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM synthetic_fixtures WHERE user_id=$1)
            ON CONFLICT DO NOTHING RETURNING user_id
        ) INSERT INTO funnel_events (id, event) SELECT $2, 'signup' FROM first_signup"#,
    )
    .bind(user_id)
    .bind(uuid::Uuid::now_v7())
    .execute(pool)
    .await
    .map_err(|e| format!("funnel signup insert failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn incoming(json: &str) -> Incoming {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn browsers_cannot_send_signup_or_unknown_events() {
        assert!(validate_browser(&incoming(r#"{"event":"signup"}"#)).is_none());
        assert!(validate_browser(&incoming(r#"{"event":"purchase"}"#)).is_none());
    }

    #[test]
    fn landing_keeps_only_the_path_without_query() {
        let row =
            validate_browser(&incoming(r#"{"event":"landing","path":"/pricing?x=1#a"}"#)).unwrap();
        assert_eq!(row.path.as_deref(), Some("/pricing"));
        let row = validate_browser(&incoming(r#"{"event":"landing","path":"http://x"}"#)).unwrap();
        assert_eq!(row.path, None);
    }

    #[test]
    fn private_paths_are_not_retained() {
        for path in [
            "/account/alice",
            "/share/private-id",
            "/login/alice@example.com",
        ] {
            assert_eq!(clean_path(path), None);
        }
        assert_eq!(
            clean_path("/zh-HK/pricing?token=secret"),
            Some("/pricing".to_owned())
        );
        assert_eq!(clean_path("/games/sudoku"), Some("/games/:slug".to_owned()));
    }

    #[test]
    fn game_start_needs_a_clean_slug() {
        assert!(validate_browser(&incoming(r#"{"event":"game_start"}"#)).is_none());
        assert!(
            validate_browser(&incoming(r#"{"event":"game_start","game_slug":"A b"}"#)).is_none()
        );
        assert!(validate_browser(&incoming(
            r#"{"event":"game_start","game_slug":"word-guess"}"#
        ))
        .is_some());
    }

    #[test]
    fn behavioral_params_reject_wrong_values_and_missing_required_fields() {
        let cases = [
            (
                json!({"event":"game_complete","game_slug":"sudoku","mode":"daily","status":"won","time_bucket_s":0,"is_guest":false}),
                &[
                    ("mode", json!("story")),
                    ("status", json!("playing")),
                    ("time_bucket_s", json!(29)),
                    ("is_guest", Value::Null),
                ][..],
            ),
            (
                json!({"event":"game_abandon","game_slug":"sudoku","mode":"practice","progress_pct_bucket":75,"is_guest":true}),
                &[
                    ("progress_pct_bucket", json!(100)),
                    ("progress_pct_bucket", json!(76)),
                ][..],
            ),
            (
                json!({"event":"hint_used","game_slug":"sudoku","mode":"archive","hint_count":1}),
                &[("hint_count", json!(0)), ("hint_count", json!(101))][..],
            ),
            (
                json!({"event":"share_clicked","game_slug":"sudoku","action":"native_share","has_percentile":false}),
                &[
                    ("action", json!("private-url")),
                    ("has_percentile", Value::Null),
                ][..],
            ),
            (
                json!({"event":"paywall_hit","game_slug":"sudoku","surface":"4th_game_lock","picks_used":3,"currency":"USD","is_guest":false}),
                &[
                    ("surface", json!("unknown_lock")),
                    ("picks_used", json!(4)),
                    ("currency", json!("usd")),
                ][..],
            ),
            (
                json!({"event":"pwa_install_prompted","platform":"other","trigger":"post_first_win"}),
                &[
                    ("platform", json!("arbitrary-user-agent")),
                    ("trigger", json!("settings")),
                ][..],
            ),
            (
                json!({"event":"pwa_installed","platform":"ios_guide","trigger":"post_first_win"}),
                &[("platform", json!("ios")), ("trigger", json!("post_win"))][..],
            ),
            (
                json!({"event":"push_opted_in","trigger":"post_win","result":"dismissed"}),
                &[
                    ("trigger", json!("post_first_win")),
                    ("result", json!("default")),
                ][..],
            ),
        ];
        for (valid, invalid_fields) in &cases {
            assert!(
                validate_browser(&incoming(&valid.to_string())).is_some(),
                "{valid}"
            );
            let fields = valid
                .as_object()
                .unwrap_or_else(|| panic!("not an event object: {valid}"));
            for field in fields.keys() {
                let mut missing = fields.clone();
                missing.remove(field);
                assert!(
                    serde_json::from_value::<Incoming>(json!(missing))
                        .ok()
                        .and_then(|request| validate_browser(&request))
                        .is_none(),
                    "accepted missing {field} in {valid}",
                );
            }
            for (field, value) in *invalid_fields {
                let mut invalid = valid.clone();
                invalid[*field] = value.clone();
                assert!(
                    validate_browser(&incoming(&invalid.to_string())).is_none(),
                    "{invalid}"
                );
            }
        }
        let mut completed = cases[0].0.clone();
        for (pick, accepted) in [(0, false), (1, true), (2, true), (3, true), (4, false)] {
            completed["pick_index"] = json!(pick);
            assert_eq!(
                validate_browser(&incoming(&completed.to_string())).is_some(),
                accepted,
                "{completed}"
            );
        }
    }

    #[test]
    fn web_vitals_need_a_known_metric_and_a_finite_value() {
        let ok = r#"{"event":"web_vitals","metric":"LCP","value":1200.5,"rating":"good"}"#;
        assert_eq!(validate_browser(&incoming(ok)).unwrap().metric, Some("LCP"));
        assert!(validate_browser(&incoming(
            r#"{"event":"web_vitals","metric":"FOO","value":1}"#
        ))
        .is_none());
        assert!(validate_browser(&incoming(
            r#"{"event":"web_vitals","metric":"CLS","value":-1}"#
        ))
        .is_none());
    }
}

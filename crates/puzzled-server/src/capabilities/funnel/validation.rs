use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};
use serde_json::json;

use super::{Incoming, Row};

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

pub(super) fn clean_path(raw: &str) -> Option<String> {
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
        event @ ("pwa_install_prompted" | "pwa_installed") => {
            let mut params = json!({
                "platform": allowed(input.platform.as_deref(), &PWA_PLATFORMS)?,
                "trigger": allowed(input.trigger.as_deref(), &["post_first_win"])?,
            });
            // Older callers omit guest status; that is not evidence of an account.
            if let Some(is_guest) = input.is_guest {
                params["is_guest"] = json!(is_guest);
            }
            (
                if event == "pwa_installed" {
                    "pwa_installed"
                } else {
                    "pwa_install_prompted"
                },
                None,
                params,
            )
        }
        event @ ("save_streak_prompted" | "save_streak_clicked") => (
            if event == "save_streak_prompted" {
                "save_streak_prompted"
            } else {
                "save_streak_clicked"
            },
            None,
            json!({
                // Connect's existing status field carries the daily finish outcome.
                "outcome": allowed(input.status.as_deref(), &STATUSES)?,
                "trigger": allowed(input.trigger.as_deref(), &["daily_finish"])?,
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

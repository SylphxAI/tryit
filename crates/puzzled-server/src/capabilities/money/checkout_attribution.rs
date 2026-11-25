//! Rust transport boundary for the browser Signal SDK snapshot. No geo policy
//! here; validate the allowed snapshots and independently respect Sec-GPC.
use axum::http::HeaderMap;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use puzzled_core::attribution::{Attribution, clean_value, click_id};
use reqwest::Url;
use serde_json::{Value, json};

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum Consent {
    #[default]
    Denied,
    AnalyticsOnly,
    Granted,
}

#[derive(Default)]
pub(crate) struct CheckoutAttribution<'a> {
    consent: Consent,
    pub(super) entry_surface: Option<&'a str>,
    fields: Value,
}

// Order on the wire: analytics_storage, ad_storage, ad_user_data, ad_personalization.
impl<'a> CheckoutAttribution<'a> {
    pub(crate) fn from_headers(headers: &'a HeaderMap) -> Self {
        if gpc(headers) {
            return Self::default();
        }
        let consent = match single_header(headers, "x-puzzled-signal-consent") {
            Some("granted,granted,granted,granted") => Consent::Granted,
            Some("granted,denied,denied,denied") => Consent::AnalyticsOnly,
            _ => Consent::Denied,
        };
        if consent == Consent::Denied {
            return Self::default();
        }
        let fields = single_header(headers, "x-puzzled-signal-attribution")
            .filter(|value| value.len() <= 6144)
            .and_then(|value| URL_SAFE_NO_PAD.decode(value).ok())
            .and_then(|json| serde_json::from_slice(&json).ok())
            .unwrap_or_default();
        Self {
            consent,
            entry_surface: single_header(headers, "x-puzzled-entry-surface")
                .filter(|value| allowed_surface(value)),
            fields,
        }
    }

    pub(crate) fn analytics_granted(&self) -> bool {
        self.consent != Consent::Denied
    }

    fn field(&self, name: &str) -> Option<&str> {
        self.fields.get(name)?.as_str()
    }

    pub(crate) fn money_tags(&self, stored: Option<Attribution>) -> Option<Attribution> {
        if !self.analytics_granted() {
            return None;
        }
        let mut tags = stored.unwrap_or_else(|| {
            let utm = |name| self.field(name).and_then(clean_value);
            Attribution {
                source: utm("utm_source"),
                medium: utm("utm_medium"),
                campaign: utm("utm_campaign"),
                term: utm("utm_term"),
                content: utm("utm_content"),
                ..Default::default()
            }
        });
        let current_click = |name| {
            (self.consent == Consent::Granted)
                .then(|| self.field(name).and_then(click_id))
                .flatten()
        };
        tags.gclid = current_click("gclid");
        tags.gbraid = current_click("gbraid");
        tags.wbraid = current_click("wbraid");
        tags.fbclid = current_click("fbclid");
        (tags.has_tag() || tags.has_click_id()).then_some(tags)
    }

    pub(super) fn binding(&self, id: &str, public_origin: &str) -> Option<Value> {
        if !token(id, 255) {
            return None;
        }
        let choice = |allowed| if allowed { "granted" } else { "denied" };
        let ad = self.consent == Consent::Granted;
        let mut payload = json!({
            "checkout_session_id": id,
            "consent": {
                "analytics_storage": choice(self.analytics_granted()),
                "ad_storage": choice(ad),
                "ad_user_data": choice(ad),
                "ad_personalization": choice(ad)
            }
        });
        if !self.analytics_granted() {
            return Some(payload);
        }
        if let Some(client) = self.field("ga_client_id").filter(|value| {
            value
                .split_once('.')
                .is_some_and(|(a, b)| digits(a, 20) && digits(b, 20))
        }) {
            payload["ga_client_id"] = json!(client);
        }
        if let Some(session) = self.field("ga_session_id").filter(|value| {
            digits(value, 16)
                && value
                    .parse::<u64>()
                    .is_ok_and(|n| (1..=9_007_199_254_740_991).contains(&n))
        }) {
            payload["ga_session_id"] = json!(session);
        }
        if ad {
            for field in ["gclid", "gbraid", "wbraid"] {
                if let Some(value) = self.field(field).filter(|value| signal_click(value)) {
                    payload[field] = json!(value);
                }
            }
            for field in ["fbc", "fbp"] {
                if let Some(value) = self
                    .field(field)
                    .filter(|value| meta_cookie(value, field == "fbc"))
                {
                    payload[field] = json!(value);
                }
            }
        }
        // Rebuild from the configured storefront, never a supplied path or Referer.
        if let Ok(mut page) = Url::parse(public_origin) {
            if page.scheme() == "https" && page.username().is_empty() && page.password().is_none() {
                page.set_path("/pricing");
                page.set_query(None);
                page.set_fragment(None);
                for field in [
                    "utm_source",
                    "utm_medium",
                    "utm_campaign",
                    "utm_id",
                    "utm_term",
                    "utm_content",
                    "utm_source_platform",
                    "utm_creative_format",
                    "utm_marketing_tactic",
                ] {
                    if let Some(value) = self.field(field).filter(|value| {
                        !value.trim().is_empty()
                            && value.len() <= 256
                            && !value.contains('@')
                            && !value.chars().any(char::is_control)
                    }) {
                        page.query_pairs_mut().append_pair(field, value);
                    }
                }
                if page.as_str().len() > 1024 {
                    page.set_query(None);
                }
                payload["page_location"] = json!(page.as_str());
            }
        }
        Some(payload)
    }
}

fn digits(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && value.bytes().all(|b| b.is_ascii_digit())
}

fn signal_click(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~'))
}

fn meta_cookie(value: &str, click: bool) -> bool {
    if value.len() > 256 {
        return false;
    }
    let mut parts = value.splitn(4, '.');
    matches!((parts.next(), parts.next(), parts.next(), parts.next()),
        (Some("fb"), Some(domain), Some(time), Some(id)) if digits(domain, 20) && digits(time, 20)
            && if click { signal_click(id) } else { digits(id, 20) })
}

pub(crate) fn gpc(headers: &HeaderMap) -> bool {
    headers.get_all("sec-gpc").iter().any(|value| {
        value
            .to_str()
            .map_or(true, |value| value.split(',').any(|v| v.trim() == "1"))
    })
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?.to_str().ok()?;
    values.next().is_none().then_some(value)
}

fn token(value: &str, max_bytes: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_bytes
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

fn allowed_surface(value: &str) -> bool {
    token(value, 100)
        && matches!(
            value,
            "pricing_subscribe"
                | "pricing_card"
                | "pricing_family_card"
                | "game_unlock"
                | "game_unlock_archive"
                | "practice_upsell"
                | "archive_banner"
                | "result_card"
                | "result_card_picks_exhausted"
                | "stats_banner"
                | "milestone_prompt"
                | "picks_pill"
                | "seo_vs-nyt-games"
                | "seo_vs-lumosity"
                | "seo_vs-linkedin-games"
                | "seo_vs-elevate"
                | "seo_vs-puzzmo"
                | "seo_vs-brilliant"
                | "seo_vs-wordle"
                | "seo_vs-hub"
                | "seo_daily-word-and-logic-puzzles-online"
                | "seo_family-brain-games-no-ads"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_surface_enum_drops_even_token_shaped_private_values() {
        for value in [
            "pricing_card",
            "seo_vs-nyt-games",
            "stats_banner",
            "practice_upsell",
        ] {
            assert!(allowed_surface(value));
        }
        for value in [
            "seo_vs-5551234",
            "pricing_card?query=value",
            "private_person",
            "user@example.test",
            " pricing_card",
            "prícing_card",
            &"a".repeat(101),
        ] {
            assert!(!allowed_surface(value));
        }
    }
}

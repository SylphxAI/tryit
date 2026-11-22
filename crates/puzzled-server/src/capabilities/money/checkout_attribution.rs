//! Closed input boundary for Money purchase dimensions and the Events binding.
use axum::http::{header, HeaderMap};
use serde_json::{json, Value};

#[derive(Default)]
pub(crate) struct CheckoutAttribution<'a> {
    pub(super) entry_surface: Option<&'a str>,
    ga_client_id: Option<&'a str>,
}

impl<'a> CheckoutAttribution<'a> {
    pub(crate) fn from_headers(headers: &'a HeaderMap) -> Self {
        let entry_surface = single_header(headers, "x-puzzled-entry-surface")
            .filter(|value| allowed_surface(value));
        // The app sends this only for an explicit grant, never a regional default.
        // The standard opt-out header wins independently of the browser UI.
        let granted = !headers.contains_key("sec-gpc")
            && single_header(headers, "x-puzzled-analytics-storage") == Some("granted");
        Self {
            entry_surface,
            ga_client_id: granted.then(|| ga_client_id(headers)).flatten(),
        }
    }

    pub(super) fn binding(&self, id: &str, public_origin: &str) -> Option<Value> {
        let client = self.ga_client_id?;
        if !token(id, 255) {
            return None;
        }
        let mut payload = json!({
            "checkout_session_id": id,
            "consent": {
                "analytics_storage": "granted",
                "ad_storage": "denied",
                "ad_user_data": "denied",
                "ad_personalization": "denied"
            },
            "ga_client_id": client
        });
        // No browser URL, referer, query, fragment or account data enters Events.
        // The configured HTTPS storefront is the only source of this page context.
        if public_origin.starts_with("https://") {
            payload["page_location"] = json!(format!("{public_origin}/pricing"));
        }
        Some(payload)
    }
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

fn ga_client_id(headers: &HeaderMap) -> Option<&str> {
    let mut found = None;
    for cookie_header in headers.get_all(header::COOKIE) {
        for part in cookie_header.to_str().ok()?.split(';') {
            if let Some(ga) = part.trim().strip_prefix("_ga=") {
                if found.is_some() {
                    return None; // Ambiguous cookie scope; do not guess.
                }
                let (depth, client) = ga.strip_prefix("GA1.")?.split_once('.')?;
                let (first, second) = client.split_once('.')?;
                let digits = |s: &str, max| {
                    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_digit())
                };
                if !(digits(depth, 2) && digits(first, 20) && digits(second, 20)) {
                    return None;
                }
                found = Some(client);
            }
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_unambiguous_grant_and_valid_ga_are_both_required() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            "session=private; _ga=GA1.1.12345.67890".parse().unwrap(),
        );
        let binding = |headers: &HeaderMap| {
            CheckoutAttribution::from_headers(headers).binding("chk_1", "https://tryit.fun")
        };
        assert_eq!(binding(&headers), None);
        headers.insert("x-puzzled-analytics-storage", "denied".parse().unwrap());
        assert_eq!(binding(&headers), None);
        headers.insert("x-puzzled-analytics-storage", "granted".parse().unwrap());
        headers.insert(
            header::REFERER,
            "https://tryit.fun/pricing?email=fixture@example.test"
                .parse()
                .unwrap(),
        );
        assert_eq!(
            binding(&headers),
            Some(json!({
                "checkout_session_id": "chk_1",
                "consent": { "analytics_storage": "granted", "ad_storage": "denied", "ad_user_data": "denied", "ad_personalization": "denied" },
                "ga_client_id": "12345.67890",
                "page_location": "https://tryit.fun/pricing"
            }))
        );
        headers.insert("sec-gpc", "1".parse().unwrap());
        assert_eq!(binding(&headers), None);
        headers.remove("sec-gpc");
        headers.append("x-puzzled-analytics-storage", "denied".parse().unwrap());
        assert_eq!(binding(&headers), None);
        headers.insert("x-puzzled-analytics-storage", "granted".parse().unwrap());
        headers.append(header::COOKIE, "_ga=GA1.1.4321.8765".parse().unwrap());
        assert_eq!(binding(&headers), None);
        headers.insert(
            header::COOKIE,
            "_ga=GA1.1.12345.user@example.test".parse().unwrap(),
        );
        assert_eq!(binding(&headers), None);
    }

    #[test]
    fn entry_surface_enum_drops_even_token_shaped_private_values() {
        for value in ["pricing_card", "seo_vs-nyt-games", "stats_banner"] {
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

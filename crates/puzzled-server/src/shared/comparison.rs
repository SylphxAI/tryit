//! One rule for requests excluded from product comparisons: the verification
//! header, or the legacy `puzzled-verify-live/` user agent. It only removes a
//! start or finish from metrics; it grants no write or auth authority.
use axum::http::HeaderMap;

#[must_use]
pub fn excluded(headers: &HeaderMap) -> bool {
    headers.contains_key("x-puzzled-verification")
        || headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("puzzled-verify-live/"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (k, v) in pairs {
            map.insert(*k, v.parse().unwrap());
        }
        map
    }

    #[test]
    fn header_only_and_legacy_agent_only_are_excluded_ordinary_requests_are_not() {
        assert!(excluded(&headers(&[("x-puzzled-verification", "1")])));
        assert!(excluded(&headers(&[(
            "user-agent",
            "puzzled-verify-live/1 ci"
        )])));
        assert!(!excluded(&headers(&[(
            "user-agent",
            "Mozilla/5.0 puzzled-verify-live/1"
        )])));
        assert!(!excluded(&headers(&[])));
    }
}

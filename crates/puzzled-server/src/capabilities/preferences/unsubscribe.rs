//! Sign and verify `userId.base36Milliseconds.truncatedHmacHex` email links.
//! The dedicated key grants only marketing opt-out, never authenticated settings.

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use uuid::Uuid;

const EXPIRY_MS: i64 = 30 * 24 * 60 * 60 * 1_000;
const CLOCK_SKEW_MS: i64 = 5 * 60 * 1_000;

#[derive(Clone)]
pub struct UnsubscribeTokens {
    secret: String,
}

impl UnsubscribeTokens {
    pub fn new(secret: String) -> Self {
        Self { secret }
    }

    pub fn from_env() -> Option<Self> {
        std::env::var("EMAIL_UNSUBSCRIBE_SECRET")
            .ok()
            .filter(|secret| !secret.is_empty())
            .map(Self::new)
    }

    pub fn sign(&self, user_id: Uuid, now_ms: i64) -> Result<String, String> {
        let mut remaining =
            u64::try_from(now_ms).map_err(|_| "invalid_unsubscribe_timestamp".to_string())?;
        let mut digits = Vec::new();
        loop {
            digits.push(char::from(
                b"0123456789abcdefghijklmnopqrstuvwxyz"[(remaining % 36) as usize],
            ));
            remaining /= 36;
            if remaining == 0 {
                break;
            }
        }
        let timestamp: String = digits.into_iter().rev().collect();
        let payload = format!("{user_id}.{timestamp}");
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret.as_bytes())
            .map_err(|_| "invalid_unsubscribe_key".to_string())?;
        mac.update(payload.as_bytes());
        let signature: String = mac.finalize().into_bytes()[..8]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        Ok(format!("{payload}.{signature}"))
    }

    pub fn verify(&self, token: &str, now_ms: i64) -> Option<Uuid> {
        let mut parts = token.split('.');
        let user = parts.next()?;
        let timestamp = parts.next()?;
        let signature = parts.next()?;
        if parts.next().is_some()
            || timestamp.is_empty()
            || !timestamp
                .bytes()
                .all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())
            || signature.len() != 16
            || !signature.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return None;
        }
        let user_id = Uuid::parse_str(user).ok()?;
        let issued_ms = i64::from_str_radix(timestamp, 36).ok()?;
        if issued_ms < now_ms.checked_sub(EXPIRY_MS)?
            || issued_ms > now_ms.checked_add(CLOCK_SKEW_MS)?
        {
            return None;
        }
        let mut provided = [0_u8; 8];
        for (i, byte) in provided.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&signature[i * 2..i * 2 + 2], 16).ok()?;
        }
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret.as_bytes()).ok()?;
        mac.update(format!("{user}.{timestamp}").as_bytes());
        // Links carry the first eight bytes of HMAC-SHA256. The crypto library
        // compares that left-truncated MAC in constant time.
        mac.verify_truncated_left(&provided).ok()?;
        Some(user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Node createHmac('sha256', 'test-unsubscribe-key') for this exact payload.
    const TOKEN: &str = "00000000-0000-0000-0000-000000000001.loyw3v28.ce95d784698caad5";
    const ISSUED: i64 = 1_700_000_000_000;

    #[test]
    fn signs_node_compatible_links() -> Result<(), String> {
        let tokens = UnsubscribeTokens::new("test-unsubscribe-key".into());
        let user = Uuid::from_u128(1);
        let token = tokens.sign(user, ISSUED)?;
        assert_eq!(token, TOKEN);
        assert_eq!(tokens.verify(&token, ISSUED), Some(user));
        Ok(())
    }

    #[test]
    fn signs_at_unix_epoch_but_rejects_negative_timestamps() -> Result<(), String> {
        let tokens = UnsubscribeTokens::new("test-unsubscribe-key".into());
        let user = Uuid::from_u128(1);
        let token = tokens.sign(user, 0)?;
        assert_eq!(token.split('.').nth(1), Some("0"));
        assert_eq!(tokens.verify(&token, 0), Some(user));
        assert_eq!(
            tokens.sign(user, -1),
            Err("invalid_unsubscribe_timestamp".into())
        );
        Ok(())
    }

    #[test]
    fn accepts_existing_links_and_expiry_boundary() {
        let verifier = UnsubscribeTokens::new("test-unsubscribe-key".into());
        assert!(verifier.verify(TOKEN, ISSUED).is_some());
        assert!(verifier.verify(TOKEN, ISSUED + EXPIRY_MS).is_some());
        assert!(verifier.verify(TOKEN, ISSUED - CLOCK_SKEW_MS).is_some());
    }

    #[test]
    fn rejects_forged_expired_future_legacy_and_malformed_links() {
        let verifier = UnsubscribeTokens::new("test-unsubscribe-key".into());
        assert!(verifier.verify(TOKEN, ISSUED + EXPIRY_MS + 1).is_none());
        assert!(verifier.verify(TOKEN, ISSUED - CLOCK_SKEW_MS - 1).is_none());
        assert!(verifier
            .verify(&TOKEN.replace("000001.", "000002."), ISSUED)
            .is_none());
        assert!(UnsubscribeTokens::new("wrong-key".into())
            .verify(TOKEN, ISSUED)
            .is_none());
        for token in [
            "",
            "user.signature",
            "user.invalid.signature",
            "user.0.0000000000000000",
            "user.zzzzzzzzzzzzzzzzzzzz.0000000000000000",
        ] {
            assert!(verifier.verify(token, ISSUED).is_none());
        }
    }
}

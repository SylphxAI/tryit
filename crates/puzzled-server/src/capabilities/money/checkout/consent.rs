use super::super::client::CreatedCheckout;

/// A cold-guest checkout session created without a pre-existing account subject.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuestCheckoutSession {
    pub created: CreatedCheckout,
    pub plan_id: String,
    pub price_key: String,
    pub locale: String,
}

/// Why a checkout could not be started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckoutError {
    /// The immediate-supply consent was not given.
    ConsentRequired,
    PlanNotOnSale,
    AlreadySubscribed,
    AttemptPending,
    AttemptChanged,
    InvalidRequest,
    Failed(String),
}

/// Return-URL path prefix for a locale: en-US has none, the others use the
/// canonical tag (`/en-GB`, `/zh-HK`), matching the web routing.
#[must_use]
pub fn locale_prefix(locale: &str) -> &'static str {
    match locale.to_ascii_lowercase().as_str() {
        "en-gb" => "/en-GB",
        "zh-cn" => "/zh-CN",
        "zh-hk" => "/zh-HK",
        "zh-tw" => "/zh-TW",
        "ja" => "/ja",
        "es" => "/es",
        "pt-br" => "/pt-BR",
        _ => "",
    }
}

/// Proof the buyer satisfied the checkout statutory terms for the chosen plan:
/// - One-off digital pass (3-Day Pass, UK CCR 2013 Reg 37): requires an
///   explicit 14-day cancellation waiver tick (`immediate_supply_consent`).
/// - Recurring subscription (Monthly/Yearly/Family, UK CCR 2013 Reg 36):
///   governed by proportionate 14-day cancellation terms; never requires
///   waiving the 14-day cancellation right.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Consent {
    OneOffDigitalWaiver,
    RecurringSubscription,
}

impl Consent {
    /// Validate checkout consent for a plan. Only one-time digital passes
    /// require the 14-day cancellation waiver.
    pub fn for_plan(one_time_pass: bool, waiver_given: bool) -> Result<Self, CheckoutError> {
        if one_time_pass {
            waiver_given
                .then_some(Self::OneOffDigitalWaiver)
                .ok_or(CheckoutError::ConsentRequired)
        } else {
            Ok(Self::RecurringSubscription)
        }
    }

    #[must_use]
    pub const fn is_one_time_pass(self) -> bool {
        matches!(self, Self::OneOffDigitalWaiver)
    }
}

/// The hosted checkout's language for a Puzzled locale. Stripe accepts only its
/// own list (it refuses `en-US` and `zh-Hant` with `invalid_request_error`), so
/// each Puzzled locale maps onto that list and anything else asks Stripe for
/// `auto` (the buyer's browser language).
#[must_use]
pub fn checkout_locale(locale: &str) -> Option<&'static str> {
    match locale.trim() {
        "" => None,
        "en-US" | "en" => Some("en"),
        "en-GB" => Some("en-GB"),
        "zh-HK" => Some("zh-HK"),
        "zh-TW" | "zh-Hant" => Some("zh-TW"),
        "zh-CN" | "zh-Hans" | "zh" => Some("zh"),
        "ja" => Some("ja"),
        "es" => Some("es"),
        "pt-BR" => Some("pt-BR"),
        _ => Some("auto"),
    }
}

const MAX_RETURN_TO_LENGTH: usize = 200;

/// Accept only a plain same-origin path for post-checkout navigation.
#[must_use]
pub fn safe_return_to(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_RETURN_TO_LENGTH {
        return None;
    }
    if !trimmed.starts_with('/') || trimmed.starts_with("//") {
        return None;
    }
    if trimmed.contains('\\') || trimmed.chars().any(char::is_control) {
        return None;
    }
    Some(trimmed.to_string())
}

pub(super) fn percent_encode_component(raw: &str) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

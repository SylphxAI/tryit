use puzzled_core::attribution::Attribution;
use serde_json::{json, Map, Value};

use super::super::{checkout_attribution::CheckoutAttribution, client::Money};
use super::consent::{
    checkout_locale, locale_prefix, percent_encode_component, safe_return_to, Consent,
};

#[allow(clippy::too_many_arguments)]
fn build_session_body(
    money: &Money,
    user_id: Option<&str>,
    plan_id: &str,
    price_key: &str,
    locale: &str,
    currency: Option<&str>,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
) -> Value {
    let base = format!("{}{}", money.public_url(), locale_prefix(locale));
    let encoded_return = return_to
        .and_then(safe_return_to)
        .map(|path| percent_encode_component(&path));
    let success_url = match &encoded_return {
        Some(encoded) => format!(
            "{base}/settings/subscription?checkout=success&s={{CHECKOUT_SESSION_ID}}&callbackUrl={encoded}"
        ),
        None => format!("{base}/settings/subscription?checkout=success&s={{CHECKOUT_SESSION_ID}}"),
    };
    let cancel_url = match &encoded_return {
        Some(encoded) => format!("{base}/pricing?checkout=cancelled&callbackUrl={encoded}"),
        None => format!("{base}/pricing?checkout=cancelled"),
    };
    let mut metadata = Map::new();
    metadata.insert("plan_id".into(), json!(plan_id));
    metadata.insert(
        "immediate_supply_consent".into(),
        json!(if consent.is_one_time_pass() {
            "true"
        } else {
            "false"
        }),
    );
    metadata.insert(
        "cancellation_regime".into(),
        json!(if consent.is_one_time_pass() {
            "uk_ccr_reg_37"
        } else {
            "uk_ccr_reg_36"
        }),
    );
    if let Some(tags) = attribution {
        for (key, value) in tags
            .metadata_pairs()
            .into_iter()
            .chain(tags.click_id_pairs())
        {
            metadata.insert(key.into(), json!(value));
        }
    }
    let mut body = json!({
        "line_items": [{"price": price_key, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": metadata,
    });
    if let Some(uid) = user_id {
        body["subject"] = json!({"end_user": uid});
    }
    if let Some(code) = checkout_locale(locale) {
        body["locale"] = json!(code);
    }
    if let Some(code) = currency {
        body["currency_code"] = json!(code.to_ascii_uppercase());
    }
    body
}

/// The `checkout_sessions` request body for an authenticated account (pure).
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn session_body(
    money: &Money,
    user_id: &str,
    plan_id: &str,
    price_key: &str,
    locale: &str,
    currency: Option<&str>,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
) -> Value {
    build_session_body(
        money,
        Some(user_id),
        plan_id,
        price_key,
        locale,
        currency,
        attribution,
        return_to,
        consent,
    )
}

/// The `checkout_sessions` request body for an unauthenticated cold guest (omits `subject`).
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn guest_session_body(
    money: &Money,
    plan_id: &str,
    price_key: &str,
    locale: &str,
    currency: Option<&str>,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
) -> Value {
    build_session_body(
        money,
        None,
        plan_id,
        price_key,
        locale,
        currency,
        attribution,
        return_to,
        consent,
    )
}

pub(super) fn set_entry_surface(body: &mut Value, measurement: &CheckoutAttribution<'_>) {
    if let Some(surface) = measurement.entry_surface {
        body["metadata"]["entry_surface"] = json!(surface);
    }
}

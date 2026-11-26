use puzzled_core::attribution::Attribution;
use serde_json::Value;

use super::super::{
    access::{FEATURE_FAMILY, FEATURE_PLUS},
    attempts, checkout_aliases,
    checkout_attribution::CheckoutAttribution,
    client::{Catalog, Money, MoneyError},
    pricing::{plan, price_of},
};
use super::consent::{CheckoutError, Consent, GuestCheckoutSession};
use super::payload::{guest_session_body, session_body, set_entry_surface};

/// Create an unclaimed guest checkout session (omitting `subject` on the wire so Money
/// allocates `guest:{id}` and returns a single-use `claim_secret`).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_guest_session(
    money: &Money,
    catalog: &Catalog,
    plan_id: &str,
    locale: &str,
    currency: &str,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
    measurement: CheckoutAttribution<'_>,
    pool: Option<&sqlx::PgPool>,
) -> Result<GuestCheckoutSession, CheckoutError> {
    let found_plan = plan(catalog, plan_id).ok_or(CheckoutError::PlanNotOnSale)?;
    let validated_consent =
        Consent::for_plan(found_plan.is_one_time_pass(), consent.is_one_time_pass())?;
    let price = price_of(catalog, &found_plan).ok_or(CheckoutError::PlanNotOnSale)?;
    let upper = currency.trim().to_ascii_uppercase();
    let chosen_currency = price.unit_amounts.contains_key(&upper).then_some(upper);
    let mut body = guest_session_body(
        money,
        plan_id,
        &found_plan.price_key,
        locale,
        chosen_currency.as_deref(),
        attribution,
        return_to,
        validated_consent,
    );
    set_entry_surface(&mut body, &measurement);
    let created = money
        .create_checkout_session_full(&body)
        .await
        .map_err(|e: MoneyError| CheckoutError::Failed(e.to_string()))?;
    checkout_aliases::remember(pool, &created.processor_session_id, &created.session_id).await;
    money
        .bind_checkout_attribution(&created.session_id, &measurement)
        .await;
    Ok(GuestCheckoutSession {
        created,
        plan_id: found_plan.plan_id,
        price_key: found_plan.price_key,
        locale: locale.to_string(),
    })
}

/// Create the session and return the hosted page's URL. `consent` is the
/// validated checkout disclosure/consent for the plan (recorded by the caller
/// before this call).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_session(
    money: &Money,
    catalog: &Catalog,
    user_id: &str,
    plan_id: &str,
    locale: &str,
    currency: &str,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
    measurement: CheckoutAttribution<'_>,
    pool: Option<&sqlx::PgPool>,
) -> Result<String, CheckoutError> {
    let mut body = prepare_session(
        money,
        catalog,
        user_id,
        plan_id,
        locale,
        currency,
        attribution,
        return_to,
        consent,
    )
    .await?;
    set_entry_surface(&mut body, &measurement);
    let created = money
        .create_checkout_session_full(&body)
        .await
        .map_err(|e: MoneyError| CheckoutError::Failed(e.to_string()))?;
    checkout_aliases::remember(pool, &created.processor_session_id, &created.session_id).await;
    money
        .bind_checkout_attribution(&created.session_id, &measurement)
        .await;
    Ok(created.url)
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn create_retained_session(
    pool: &sqlx::PgPool,
    money: &Money,
    catalog: &Catalog,
    user_id: &str,
    request_id: &str,
    plan_id: &str,
    locale: &str,
    currency: &str,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
    measurement: CheckoutAttribution<'_>,
) -> Result<String, CheckoutError> {
    let mut body = prepare_session(
        money,
        catalog,
        user_id,
        plan_id,
        locale,
        currency,
        attribution,
        return_to,
        consent,
    )
    .await?;
    set_entry_surface(&mut body, &measurement);
    let session = attempts::create(pool, money, user_id, request_id, &body)
        .await
        .map_err(|error| match error {
            attempts::Error::InvalidRequest => CheckoutError::InvalidRequest,
            attempts::Error::RequestChanged => CheckoutError::AttemptChanged,
            attempts::Error::Pending => CheckoutError::AttemptPending,
            _ => CheckoutError::Failed("checkout_unavailable".into()),
        })?;
    if let Some(id) = session["name"]
        .as_str()
        .and_then(|name| name.rsplit('/').next())
    {
        let processor = session["processor_session_id"].as_str().unwrap_or_default();
        checkout_aliases::remember(Some(pool), processor, id).await;
        money.bind_checkout_attribution(id, &measurement).await;
    }
    session
        .get("url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| CheckoutError::Failed("checkout_unavailable".into()))
}

#[allow(clippy::too_many_arguments)]
async fn prepare_session(
    money: &Money,
    catalog: &Catalog,
    user_id: &str,
    plan_id: &str,
    locale: &str,
    currency: &str,
    attribution: Option<&Attribution>,
    return_to: Option<&str>,
    consent: Consent,
) -> Result<Value, CheckoutError> {
    let plan = plan(catalog, plan_id).ok_or(CheckoutError::PlanNotOnSale)?;
    let validated_consent = Consent::for_plan(plan.is_one_time_pass(), consent.is_one_time_pass())?;
    let price = price_of(catalog, &plan).ok_or(CheckoutError::PlanNotOnSale)?;
    let feature = if plan.family {
        FEATURE_FAMILY
    } else {
        FEATURE_PLUS
    };
    if money.check(user_id, feature).await.entitled {
        return Err(CheckoutError::AlreadySubscribed);
    }
    let currency = currency.trim().to_ascii_uppercase();
    let currency = price
        .unit_amounts
        .contains_key(&currency)
        .then_some(currency);
    Ok(session_body(
        money,
        user_id,
        plan_id,
        &plan.price_key,
        locale,
        currency.as_deref(),
        attribution,
        return_to,
        validated_consent,
    ))
}

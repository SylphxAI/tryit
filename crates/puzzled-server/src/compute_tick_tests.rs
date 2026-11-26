//! Exercise the real router against the published SDK and a local JWKS issuer.
//! No product-side key injection or alternate receipt verification path.

mod auth;
mod logs;
mod manifest;
mod support;

#[test]
fn compute_callback_regressions_cover_every_declared_schedule() {
    manifest::assert_schedule_coverage();
}

#[tokio::test]
async fn compute_callbacks_accept_only_authentic_receipts_for_the_exact_request() {
    auth::assert_exact_request_binding().await;
}

#[tokio::test]
async fn compute_callbacks_never_authorize_on_provider_outage() {
    auth::assert_provider_outage_refused().await;
}

#[tokio::test]
async fn compute_tick_warning_omits_receipt_sdk_payload_and_query() {
    logs::assert_rejection_warning_redacted().await;
}

#[tokio::test]
async fn compute_tick_admission_info_omits_signed_receipt_and_query() {
    logs::assert_admission_info_redacted().await;
}

#[tokio::test]
async fn compute_callbacks_bind_host_and_preserve_the_existing_forwarded_host_fallback() {
    auth::assert_host_binding_and_fallback().await;
}

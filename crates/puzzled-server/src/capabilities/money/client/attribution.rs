use crate::capabilities::money::{checkout_attribution::CheckoutAttribution, signal};

use super::Money;

impl Money {
    /// Best-effort Events write before handing the buyer the payment URL. A bounded
    /// failure must not block payment; log status only, never attribution identifiers.
    pub(in crate::capabilities::money) async fn bind_checkout_attribution(
        &self,
        session_id: &str,
        measurement: &CheckoutAttribution<'_>,
    ) {
        let Some(payload) = measurement.binding(session_id, self.public_url()) else {
            return;
        };
        signal::checkout_started(
            &self.origin,
            self.publishable_key.as_deref(),
            session_id,
            measurement,
        );
        let Some(key) = self.publishable_key.as_deref() else {
            tracing::warn!("checkout attribution publishable key unavailable");
            return;
        };
        static CLIENT: std::sync::OnceLock<Option<reqwest::Client>> = std::sync::OnceLock::new();
        let Some(client) = CLIENT.get_or_init(|| {
            reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_millis(750))
                .build()
                .ok()
        }) else {
            tracing::warn!("checkout attribution client unavailable");
            return;
        };
        match client
            .post(format!("{}/v1/events/attribution_bindings", self.origin))
            .header("x-sylphx-key", key)
            .json(&payload)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {}
            Ok(response) => tracing::warn!(
                status = response.status().as_u16(),
                "checkout attribution refused"
            ),
            Err(_) => tracing::warn!("checkout attribution unavailable"),
        }
    }
}

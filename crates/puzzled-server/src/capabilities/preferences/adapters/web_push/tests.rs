use super::delivery::deliver_subscriptions_with_clock;
use super::{deliver_subscriptions_until, reminder_payload, valid_endpoint, valid_keys};
use crate::capabilities::preferences::adapters::web_push_sender::{PushDelivery, PushSender};
use uuid::Uuid;
use web_push::SubscriptionInfo;

#[test]
fn endpoints_cannot_fetch_internal_services() {
    for url in [
        "http://fcm.googleapis.com/x",
        "https://127.0.0.1/x",
        "https://fcm.googleapis.com.evil.test/x",
        "https://user@fcm.googleapis.com/x",
        "https://fcm.googleapis.com:8443/x",
    ] {
        assert!(!valid_endpoint(url));
    }
    for url in [
        "https://fcm.googleapis.com/fcm/send/test",
        "https://updates.push.services.mozilla.com/wpush/v2/test",
        "https://web.push.apple.com/test",
        "https://jmt17.google.com/fcm/send/test",
        "https://wns2-par02p.notify.windows.com/w/?token=x",
        "https://api.push.apple.com/3/device/x",
    ] {
        assert!(valid_endpoint(url), "{url}");
    }
    for url in [
        "https://google.com/x",
        "https://evilgoogle.com/x",
        "https://fcm.googleapis.com.evil.com/x",
        "https://evil.com/.google.com",
        "http://jmt17.google.com/x",
        "https://[::1]/x",
        "https://127.0.0.1/x",
        "https://jmt17.google.com:8443/x",
        "https://u:p@jmt17.google.com/x",
    ] {
        assert!(!valid_endpoint(url), "{url}");
    }
}
#[test]
fn validates_keys_and_all_locales() {
    assert!(!valid_keys("", ""));
    for locale in [
        "en-US", "en-GB", "zh-HK", "zh-TW", "zh-CN", "ja", "es", "pt-BR",
    ] {
        let payload = reminder_payload(locale);
        assert!(!payload["body"].as_str().unwrap().is_empty());
    }
}
async fn slow_endpoint_budget(any_success: bool) {
    use std::sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc,
    };
    struct SlowSender {
        elapsed: Arc<AtomicU64>,
        attempts: AtomicUsize,
        any_success: bool,
    }
    impl PushSender for SlowSender {
        async fn send<'a>(
            &'a self,
            _subscription: &'a SubscriptionInfo,
            _payload: &'a str,
        ) -> Result<PushDelivery, String> {
            let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
            // Deterministically model the existing ten-second endpoint limit.
            self.elapsed.fetch_add(10, Ordering::SeqCst);
            if self.any_success && attempt == 0 {
                Ok(PushDelivery::Delivered)
            } else {
                Err("slow endpoint failed".to_string())
            }
        }
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://test@127.0.0.1:59473/test")
        .unwrap();
    let elapsed = Arc::new(AtomicU64::new(0));
    let sender = SlowSender {
        elapsed: elapsed.clone(),
        attempts: AtomicUsize::new(0),
        any_success,
    };
    let base = tokio::time::Instant::now();
    let deadline = base + std::time::Duration::from_secs(290);
    let subscriptions = (0..100)
        .map(|i| {
            SubscriptionInfo::new(
                format!("https://fcm.googleapis.com/fcm/send/{i}"),
                "public-key".to_string(),
                "auth-key".to_string(),
            )
        })
        .collect();
    let result = deliver_subscriptions_with_clock(
        &pool,
        Uuid::now_v7(),
        subscriptions,
        "{}",
        &sender,
        Some(deadline),
        || base + std::time::Duration::from_secs(elapsed.load(Ordering::SeqCst)),
    )
    .await;
    assert_eq!(sender.attempts.load(Ordering::SeqCst), 29);
    assert_eq!(elapsed.load(Ordering::SeqCst), 290);
    assert_eq!(result.is_ok(), any_success);
    // Ten seconds remain for the fenced database acknowledgement. No 30th
    // endpoint starts; any success before exhaustion stays accumulated.
}

#[tokio::test]
async fn slow_endpoints_stop_with_ack_budget_and_keep_partial_success() {
    slow_endpoint_budget(true).await;
}

#[tokio::test]
async fn slow_endpoints_with_no_success_release_instead_of_marking_delivery() {
    slow_endpoint_budget(false).await;
}

#[tokio::test]
async fn stalled_endpoint_deadline_does_not_cancel_previous_success() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct StalledSender(AtomicUsize);
    impl PushSender for StalledSender {
        async fn send<'a>(
            &'a self,
            _subscription: &'a SubscriptionInfo,
            _payload: &'a str,
        ) -> Result<PushDelivery, String> {
            if self.0.fetch_add(1, Ordering::SeqCst) == 0 {
                Ok(PushDelivery::Delivered)
            } else {
                std::future::pending().await
            }
        }
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://test@127.0.0.1:59473/test")
        .unwrap();
    let sender = StalledSender(AtomicUsize::new(0));
    let subscriptions = (0..3)
        .map(|i| {
            SubscriptionInfo::new(
                format!("https://fcm.googleapis.com/fcm/send/{i}"),
                "public-key".to_string(),
                "auth-key".to_string(),
            )
        })
        .collect();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(20);
    assert!(deliver_subscriptions_until(
        &pool,
        Uuid::now_v7(),
        subscriptions,
        "{}",
        &sender,
        Some(deadline)
    )
    .await
    .is_ok());
    assert_eq!(sender.0.load(Ordering::SeqCst), 2);
}

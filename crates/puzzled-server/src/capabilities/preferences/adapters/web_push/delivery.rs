use super::{payload::reminder_payload, subscriptions::remove};
use crate::capabilities::preferences::adapters::web_push_sender::{
    DirectVapidSender, PushDelivery, PushSender,
};
use sqlx::PgPool;
use uuid::Uuid;
use web_push::SubscriptionInfo;

/// Send to every active browser. Expired endpoints are removed; transient
/// failures release the daily claim only if no browser received the reminder.
pub async fn send_daily(
    pool: &PgPool,
    player: &str,
    deadline: tokio::time::Instant,
) -> Result<(), String> {
    let player = Uuid::parse_str(player).map_err(|_| "invalid player".to_string())?;
    let rows: Vec<(String, String, String)> = tokio::time::timeout_at(
        deadline,
        sqlx::query_as("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1")
            .bind(player)
            .fetch_all(pool),
    )
    .await
    .map_err(|_| "push delivery deadline reached".to_string())?
    .map_err(|_| "push subscription read failed".to_string())?;
    if rows.is_empty() {
        return Ok(());
    }
    let locale: Option<String> = tokio::time::timeout_at(
        deadline,
        sqlx::query_scalar(
            "SELECT COALESCE(locale, 'en-US') FROM user_preferences WHERE user_id = $1",
        )
        .bind(player)
        .fetch_optional(pool),
    )
    .await
    .map_err(|_| "push delivery deadline reached".to_string())?
    .map_err(|_| "push locale read failed".to_string())?;
    let payload = reminder_payload(locale.as_deref().unwrap_or("en-US")).to_string();
    let sender = DirectVapidSender::from_env()?;
    let subscriptions = rows
        .into_iter()
        .map(|(endpoint, p256dh, auth)| SubscriptionInfo::new(endpoint, p256dh, auth))
        .collect();
    deliver_subscriptions_until(
        pool,
        player,
        subscriptions,
        &payload,
        &sender,
        Some(deadline),
    )
    .await
}

/// Subscription lifecycle stays above the transport adapter. A future Notify
/// sender returns the same delivery outcomes; the reminder job is unchanged.
pub async fn deliver_subscriptions(
    pool: &PgPool,
    player: Uuid,
    subscriptions: Vec<SubscriptionInfo>,
    payload: &str,
    sender: &impl PushSender,
) -> Result<(), String> {
    deliver_subscriptions_until(pool, player, subscriptions, payload, sender, None).await
}

/// Deadline lives inside the accumulator: cancelling a stalled endpoint must
/// not discard successes already observed on other browsers. The job reserves
/// acknowledgement time before supplying this lease-relative deadline.
pub async fn deliver_subscriptions_until(
    pool: &PgPool,
    player: Uuid,
    subscriptions: Vec<SubscriptionInfo>,
    payload: &str,
    sender: &impl PushSender,
    deadline: Option<tokio::time::Instant>,
) -> Result<(), String> {
    deliver_subscriptions_with_clock(
        pool,
        player,
        subscriptions,
        payload,
        sender,
        deadline,
        tokio::time::Instant::now,
    )
    .await
}

pub(super) async fn deliver_subscriptions_with_clock(
    pool: &PgPool,
    player: Uuid,
    subscriptions: Vec<SubscriptionInfo>,
    payload: &str,
    sender: &impl PushSender,
    deadline: Option<tokio::time::Instant>,
    mut now: impl FnMut() -> tokio::time::Instant,
) -> Result<(), String> {
    let mut failed = false;
    let mut delivered = false;
    for subscription in subscriptions {
        if deadline.is_some_and(|deadline| now() >= deadline) {
            failed = true;
            break;
        }
        let outcome = match deadline {
            Some(deadline) => {
                tokio::time::timeout_at(deadline, sender.send(&subscription, payload))
                    .await
                    .unwrap_or_else(|_| Err("push delivery deadline reached".to_string()))
            }
            None => sender.send(&subscription, payload).await,
        };
        match outcome {
            Ok(PushDelivery::Delivered) => delivered = true,
            Ok(PushDelivery::Expired) => {
                // Continue after pruning errors: a later browser may receive the
                // reminder, in which case the player-level claim must stay held.
                let removed = match deadline {
                    Some(deadline) => tokio::time::timeout_at(
                        deadline,
                        remove(pool, player, &subscription.endpoint),
                    )
                    .await
                    .is_ok_and(|result| result.is_ok()),
                    None => remove(pool, player, &subscription.endpoint).await.is_ok(),
                };
                if !removed {
                    failed = true;
                }
            }
            Err(_) => failed = true,
        }
    }
    // A claim is per player, not per endpoint. Retrying after partial success
    // would notify the successful browser again during the grace window.
    if failed && !delivered {
        Err("web push delivery failed".to_string())
    } else {
        Ok(())
    }
}

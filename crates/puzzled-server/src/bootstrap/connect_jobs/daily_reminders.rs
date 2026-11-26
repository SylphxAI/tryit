//! Daily reminder claim, delivery, and lease acknowledgement.

use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key;

use crate::capabilities::jobs::adapters::jobs_db;

/// Injectable delivery keeps the real claim/release loop testable without
/// contacting browser push services or loading VAPID credentials.
pub(crate) async fn send_due_daily_reminders_with<F, Fut>(
    pool: &sqlx::PgPool,
    now: chrono::DateTime<Utc>,
    mut send: F,
) -> Result<u32, Vec<String>>
where
    F: FnMut(String, tokio::time::Instant) -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    let started = tokio::time::Instant::now();
    let elapsed_now = || {
        chrono::Duration::from_std(started.elapsed())
            .ok()
            .and_then(|elapsed| now.checked_add_signed(elapsed))
            .ok_or_else(|| vec!["daily reminder elapsed clock overflow".to_string()])
    };
    let mut claim_at = now;
    let mut processed = 0u32;
    let mut cursor = None;
    let mut errors = Vec::new();
    loop {
        let product_day = product_day_key(claim_at).format("%Y-%m-%d").to_string();
        let batch =
            match jobs_db::claim_due_daily_reminders_after(pool, claim_at, &product_day, cursor)
                .await
            {
                Ok(batch) => batch,
                Err(error) => {
                    errors.push(error);
                    return Err(errors);
                }
            };
        let Some(next_cursor) = batch.next_cursor else {
            return if errors.is_empty() {
                Ok(processed)
            } else {
                Err(errors)
            };
        };
        cursor = Some(next_cursor);
        for claim in batch.claims {
            let user_id = &claim.user_id;
            // Delivery returns success if any endpoint received the reminder;
            // only a wholly unsuccessful retryable delivery releases this claim.
            // Do not start abandoned batch work after its lease has expired.
            // Keep the adapter's per-endpoint timeout: cancelling a whole player
            // midway would discard its already-successful endpoint outcomes.
            let delivery_started_at = elapsed_now()?;
            let delivery_until = claim.lease_until - chrono::Duration::seconds(10);
            if delivery_started_at >= delivery_until {
                errors.push(format!("{user_id}: reminder lease expired before delivery"));
                continue;
            }
            let budget = (delivery_until - delivery_started_at)
                .to_std()
                .map_err(|_| vec!["daily reminder deadline overflow".to_string()])?;
            let deadline = tokio::time::Instant::now() + budget;
            let lease_deadline = deadline + std::time::Duration::from_secs(10);
            let delivery = send(user_id.clone(), deadline).await;
            let completed_at = elapsed_now()?;
            match delivery {
                Ok(()) => {
                    let acknowledgement = tokio::time::timeout_at(
                        lease_deadline,
                        jobs_db::acknowledge_daily_reminder(pool, &claim, completed_at),
                    )
                    .await
                    .unwrap_or_else(|_| {
                        Err("daily reminder acknowledgement deadline reached".to_string())
                    });
                    match acknowledgement {
                        Ok(true) => processed += 1,
                        Ok(false) => {
                            errors.push(format!("{user_id}: reminder lease expired or replaced"))
                        }
                        Err(e) => errors.push(format!("{user_id} acknowledge: {e}")),
                    }
                }
                Err(e) => {
                    errors.push(format!("{user_id}: {e}"));
                    let released = tokio::time::timeout_at(
                        lease_deadline,
                        jobs_db::release_daily_reminder(pool, &claim, completed_at),
                    )
                    .await
                    .unwrap_or_else(|_| Err("daily reminder release deadline reached".to_string()));
                    if let Err(release) = released {
                        errors.push(format!("{user_id} release: {release}"));
                    }
                }
            }
        }
        // Keep progressing after failures. The invocation cursor advances past
        // every candidate, so released players are retried only by a later tick.
        claim_at = elapsed_now()?;
    }
}

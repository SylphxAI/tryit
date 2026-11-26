use super::send_due_daily_reminders_with;
use super::win_back::{run_win_back_emails, win_back_message, win_back_unsubscribe_url};

use crate::bootstrap::AppState;
use crate::capabilities::preferences::adapters::web_push;
use crate::capabilities::preferences::unsubscribe::UnsubscribeTokens;
use crate::test_support::fresh_database;
use chrono::NaiveDate;
use uuid::Uuid;

#[test]
fn tryit_win_back_copy_uses_signed_opt_out_and_configured_origin() -> Result<(), String> {
    const ISSUED: i64 = 1_700_000_000_000;
    const TOKEN: &str = "00000000-0000-0000-0000-000000000001.loyw3v28.ce95d784698caad5";
    let tokens = UnsubscribeTokens::new("test-unsubscribe-key".into());
    let other_key = UnsubscribeTokens::new("wrong-key".into());
    let user_id = Uuid::from_u128(1);
    let other_id = Uuid::from_u128(2);
    for origin in [
        crate::shared::public_origin::DEFAULT_PUBLIC_URL,
        "https://puzzled.gg",
        "https://puzzled.test",
    ] {
        let url = win_back_unsubscribe_url(&tokens, origin, &user_id.to_string(), ISSUED)?;
        let (subject, body) = win_back_message(origin, &url);
        let prefix =
            format!("Unsubscribe from puzzle emails: {origin}/api/email/unsubscribe?token=");
        let token = body.lines().find_map(|line| line.strip_prefix(&prefix));
        assert_eq!(token, Some(TOKEN));
        let token = token.ok_or("missing opt-out link")?;
        assert_eq!(tokens.verify(token, ISSUED), Some(user_id));
        assert_eq!(other_key.verify(token, ISSUED), None);
        let forged = token.replacen(&user_id.to_string(), &other_id.to_string(), 1);
        assert_eq!(tokens.verify(&forged, ISSUED), None);
        assert_eq!(subject, "Your next puzzle is waiting at Tryit");
        assert!(body.contains(&format!("Play today's puzzle: {origin}/")));
        assert!(body.contains("hi@tryit.fun"));
        assert!(!body.contains("day7"));
        assert!(!subject.contains("Puzzled"));
        assert!(!subject.contains("Sylphx"));
        assert!(!body.contains("Sylphx"));
        assert!(!body.contains("streak"));
    }
    assert_eq!(
        win_back_unsubscribe_url(&tokens, "https://tryit.fun", "not-a-uuid", ISSUED),
        Err("invalid_win_back_user_id".into())
    );
    Ok(())
}

#[tokio::test]
async fn win_back_refuses_before_database_or_delivery_without_unsubscribe_key() {
    let mut state = AppState::new(None);
    state.unsubscribe = None;
    assert_eq!(
        run_win_back_emails(&state).await,
        Err(vec!["unsubscribe_not_configured".to_string()])
    );
}

/// Exercise consecutive Compute ticks through the real database claim/release
/// loop, with no outbound delivery and no VAPID configuration.
async fn consecutive_reminder_ticks(any_success: bool) {
    use crate::capabilities::preferences::adapters::web_push_sender::{PushDelivery, PushSender};
    use ::web_push::SubscriptionInfo;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TestSender {
        any_success: bool,
        attempts: AtomicUsize,
    }
    impl PushSender for TestSender {
        async fn send<'a>(
            &'a self,
            subscription: &'a SubscriptionInfo,
            _payload: &'a str,
        ) -> Result<PushDelivery, String> {
            self.attempts.fetch_add(1, Ordering::Relaxed);
            if self.any_success && subscription.endpoint.ends_with("live") {
                Ok(PushDelivery::Delivered)
            } else {
                Err("retryable failure".to_string())
            }
        }
    }
    let Some(pool) = fresh_database().await else {
        return;
    };
    let player = Uuid::now_v7();
    sqlx::query("INSERT INTO notification_preferences (user_id, push_enabled, push_daily_reminder, daily_reminder_time, timezone) VALUES ($1, true, true, '08:00', 'UTC')")
    .bind(player)
    .execute(&pool)
    .await
    .unwrap();
    let sender = TestSender {
        any_success,
        attempts: AtomicUsize::new(0),
    };
    let now = NaiveDate::from_ymd_opt(2026, 10, 1)
        .unwrap()
        .and_hms_opt(8, 0, 0)
        .unwrap()
        .and_utc();
    for tick in 0..2 {
        let result = send_due_daily_reminders_with(
            &pool,
            now + chrono::Duration::minutes(tick * 15),
            |user_id, _deadline| {
                let pool = &pool;
                let sender = &sender;
                async move {
                    let subscriptions = ["failed", "live"]
                        .into_iter()
                        .map(|suffix| {
                            SubscriptionInfo::new(
                                format!("https://fcm.googleapis.com/fcm/send/{suffix}"),
                                "public-key".to_string(),
                                "auth-key".to_string(),
                            )
                        })
                        .collect();
                    web_push::deliver_subscriptions(
                        pool,
                        Uuid::parse_str(&user_id).unwrap(),
                        subscriptions,
                        "{}",
                        sender,
                    )
                    .await
                }
            },
        )
        .await;
        if any_success {
            assert_eq!(result.unwrap(), if tick == 0 { 1 } else { 0 });
        } else {
            assert!(result.is_err());
        }
    }
    let claim: Option<NaiveDate> = sqlx::query_scalar(
        "SELECT last_daily_reminder_on FROM notification_preferences WHERE user_id = $1",
    )
    .bind(player)
    .fetch_one(&pool)
    .await
    .unwrap();
    if any_success {
        assert_eq!(sender.attempts.load(Ordering::Relaxed), 2);
        assert_eq!(claim, Some(now.date_naive()));
    } else {
        assert_eq!(sender.attempts.load(Ordering::Relaxed), 4);
        assert_eq!(claim, None);
    }
}

#[tokio::test]
async fn mixed_success_keeps_daily_claim_across_consecutive_ticks() {
    consecutive_reminder_ticks(true).await;
}

#[tokio::test]
async fn all_failed_releases_daily_claim_for_next_tick_retry() {
    consecutive_reminder_ticks(false).await;
}
#[tokio::test]
async fn cancelled_worker_and_reconstructed_worker_recover_the_unacknowledged_batch() {
    use crate::capabilities::jobs::adapters::jobs_db::REMINDER_LEASE_SECONDS;
    let Some(pool) = fresh_database().await else {
        return;
    };
    for _ in 0..3 {
        sqlx::query("INSERT INTO notification_preferences (user_id, push_enabled, push_daily_reminder, daily_reminder_time, timezone) VALUES ($1, true, true, '08:00', 'UTC')")
            .bind(Uuid::now_v7()).execute(&pool).await.unwrap();
    }
    let now = "2026-10-01T08:00:00Z".parse().unwrap();
    let (entered, started) = tokio::sync::oneshot::channel();
    let worker_pool = pool.clone();
    let worker = tokio::spawn(async move {
        let mut entered = Some(entered);
        let mut attempts = 0;
        send_due_daily_reminders_with(&worker_pool, now, |_, _| {
            attempts += 1;
            let first = attempts == 1;
            if !first {
                if let Some(entered) = entered.take() {
                    entered.send(()).unwrap();
                }
            }
            async move {
                if first {
                    Ok(())
                } else {
                    std::future::pending::<Result<(), String>>().await
                }
            }
        })
        .await
    });
    started.await.unwrap();
    worker.abort();
    assert!(worker.await.unwrap_err().is_cancelled());
    let delivered: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notification_preferences WHERE last_daily_reminder_on IS NOT NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(delivered, 1);
    // Reconstruct the executor with no in-memory claim state. It cannot steal
    // live leases; expiry recovers only the two not acknowledged as delivered.
    assert_eq!(
        send_due_daily_reminders_with(&pool, now, |_, _| async { Ok(()) })
            .await
            .unwrap(),
        0
    );
    let retried = now + chrono::Duration::seconds(REMINDER_LEASE_SECONDS);
    assert_eq!(
        send_due_daily_reminders_with(&pool, retried, |_, _| async { Ok(()) })
            .await
            .unwrap(),
        2
    );
    assert_eq!(
        send_due_daily_reminders_with(&pool, retried, |_, _| async { Ok(()) })
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn successful_tick_drains_more_than_one_bounded_batch() {
    use crate::capabilities::jobs::adapters::jobs_db::REMINDER_CLAIM_BATCH;
    let Some(pool) = fresh_database().await else {
        return;
    };
    for _ in 0..(REMINDER_CLAIM_BATCH + 1) {
        sqlx::query("INSERT INTO notification_preferences (user_id, push_enabled, push_daily_reminder, daily_reminder_time, timezone) VALUES ($1, true, true, '08:00', 'UTC')")
            .bind(Uuid::now_v7()).execute(&pool).await.unwrap();
    }
    let now = "2026-10-01T08:00:00Z".parse().unwrap();
    assert_eq!(
        send_due_daily_reminders_with(&pool, now, |_, _| async { Ok(()) })
            .await
            .unwrap(),
        (REMINDER_CLAIM_BATCH + 1) as u32
    );
    assert_eq!(
        send_due_daily_reminders_with(&pool, now, |_, _| async { Ok(()) })
            .await
            .unwrap(),
        0
    );
}
#[tokio::test]
async fn failing_first_batch_does_not_starve_player_seventeen_or_retry_releases() {
    use crate::capabilities::jobs::adapters::jobs_db::REMINDER_CLAIM_BATCH;
    let Some(pool) = fresh_database().await else {
        return;
    };
    for i in 1..=(REMINDER_CLAIM_BATCH + 1) {
        sqlx::query("INSERT INTO notification_preferences (user_id, push_enabled, push_daily_reminder, daily_reminder_time, timezone) VALUES ($1, true, true, '08:00', 'UTC')")
            .bind(Uuid::from_u128(i as u128)).execute(&pool).await.unwrap();
    }
    let now = "2026-10-01T08:00:00Z".parse().unwrap();
    let mut attempts = Vec::new();
    let result = send_due_daily_reminders_with(&pool, now, |user_id, _| {
        let user = Uuid::parse_str(&user_id).unwrap();
        attempts.push(user);
        async move {
            if user.as_u128() == (REMINDER_CLAIM_BATCH + 1) as u128 {
                Ok(())
            } else {
                Err("retryable failure".to_string())
            }
        }
    })
    .await;
    assert_eq!(result.unwrap_err().len(), REMINDER_CLAIM_BATCH as usize);
    assert_eq!(attempts.len(), (REMINDER_CLAIM_BATCH + 1) as usize);
    assert_eq!(
        attempts
            .iter()
            .copied()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        attempts.len()
    );
    let delivered: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM notification_preferences WHERE last_daily_reminder_on IS NOT NULL",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        delivered,
        vec![Uuid::from_u128((REMINDER_CLAIM_BATCH + 1) as u128)]
    );
}

//! Scheduled win-back emails and signed unsubscribe links.

use chrono::Utc;
use uuid::Uuid;

use crate::bootstrap::AppState;
use crate::capabilities::jobs::adapters::jobs_db;
use crate::capabilities::preferences::unsubscribe::UnsubscribeTokens;
use crate::shared::dest_http::{dest_email_connector_id, dest_email_delivery, dest_events_deliver};

pub(super) async fn run_win_back_emails(state: &AppState) -> Result<u32, Vec<String>> {
    let Some(unsubscribe) = &state.unsubscribe else {
        return Err(vec!["unsubscribe_not_configured".to_string()]);
    };
    let Some(pool) = &state.pool else {
        return Err(vec!["no database pool".to_string()]);
    };
    let connector_id = dest_email_connector_id().map_err(|e| vec![e])?;
    let origin = crate::shared::public_origin::public_origin().map_err(|e| vec![e.to_string()])?;
    let mut errors = Vec::new();
    let mut processed = 0u32;
    let today = Utc::now().date_naive();
    for (email_type, days) in [("day7", 7i64), ("day14", 14i64), ("day30", 30i64)] {
        let targets = jobs_db::win_back_targets(pool, email_type, days)
            .await
            .map_err(|e| vec![e])?;
        for (user_id, email) in targets {
            let result = async {
                let now_ms = jiff::Timestamp::now().as_millisecond();
                let unsubscribe_url =
                    win_back_unsubscribe_url(unsubscribe, &origin, &user_id, now_ms)?;
                let (subject, text_body) = win_back_message(&origin, &unsubscribe_url);
                let delivery = dest_email_delivery(
                    &connector_id,
                    &user_id,
                    &email,
                    email_type,
                    subject,
                    &text_body,
                );
                dest_events_deliver(delivery).await?;
                jobs_db::record_win_back_email(pool, &user_id, email_type, today)
                    .await
                    .map_err(|e| format!("record: {e}"))
            }
            .await;
            match result {
                Ok(()) => processed += 1,
                Err(e) => errors.push(format!("{user_id}: {e}")),
            }
        }
    }
    if errors.is_empty() {
        Ok(processed)
    } else {
        Err(errors)
    }
}

pub(super) fn win_back_unsubscribe_url(
    unsubscribe: &UnsubscribeTokens,
    origin: &str,
    user_id: &str,
    now_ms: i64,
) -> Result<String, String> {
    let user_id = Uuid::parse_str(user_id).map_err(|_| "invalid_win_back_user_id".to_string())?;
    let token = unsubscribe.sign(user_id, now_ms)?;
    Ok(format!("{origin}/api/email/unsubscribe?token={token}"))
}

pub(super) fn win_back_message(origin: &str, unsubscribe_url: &str) -> (&'static str, String) {
    (
        "Your next puzzle is waiting at Tryit",
        format!("Take a short puzzle break at Tryit.\n\nPlay today's puzzle: {origin}/\n\nNeed a hand? hi@tryit.fun\n\nUnsubscribe from puzzle emails: {unsubscribe_url}"),
    )
}

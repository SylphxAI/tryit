use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::TRACE_TARGET;
use crate::bootstrap::identity::require_identity;
use crate::bootstrap::state::AppState;
use crate::capabilities::preferences::adapters::preferences_db::{
    fetch_notification_preferences, is_reminder_time, timezone_is_known,
    upsert_notification_preferences,
};
use crate::proto::puzzled::v1::{
    GetNotificationPreferencesRequest, GetNotificationPreferencesResponse, NotificationPreferences,
    UnsubscribeEmailRequest, UnsubscribeEmailResponse, UpdateEmailPreferencesRequest,
    UpdateEmailPreferencesResponse, UpdatePushPreferencesRequest, UpdatePushPreferencesResponse,
};

pub(super) async fn get_notification_preferences(
    state: &AppState,
    ctx: RequestContext,
    _request: ServiceRequest<'_, GetNotificationPreferencesRequest>,
) -> ServiceResult<GetNotificationPreferencesResponse> {
    let identity = require_identity(&ctx)?;
    let prefs = match &state.pool {
        Some(pool) => match fetch_notification_preferences(pool, &identity.user_id).await {
            Ok(value) => prefs_from_json(&value),
            Err(error) => {
                tracing::warn!(target: TRACE_TARGET, %error, "notification prefs read failed");
                return Err(ConnectError::new(
                    ErrorCode::Internal,
                    "preferences_read_failed",
                ));
            }
        },
        None => NotificationPreferences::default(),
    };
    Response::ok(GetNotificationPreferencesResponse {
        preferences: prefs.into(),
        ..Default::default()
    })
}

pub(super) async fn update_push_preferences(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, UpdatePushPreferencesRequest>,
) -> ServiceResult<UpdatePushPreferencesResponse> {
    let identity = require_identity(&ctx)?;
    let req = request.to_owned_message();
    if let Some(time) = req.daily_reminder_time.as_deref() {
        if !is_reminder_time(time) {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "invalid_reminder_time",
            ));
        }
    }
    if let (Some(zone), Some(pool)) = (req.timezone.as_deref(), &state.pool) {
        let known = timezone_is_known(pool, zone).await.map_err(|error| {
            tracing::warn!(target: TRACE_TARGET, %error, "time zone check failed");
            ConnectError::new(ErrorCode::Internal, "preferences_update_failed")
        })?;
        if !known {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "invalid_timezone",
            ));
        }
    }
    if let Some(pool) = &state.pool {
        if let Err(error) = upsert_notification_preferences(
            pool,
            &identity.user_id,
            req.push_enabled,
            req.push_daily_reminder,
            req.push_streak_alert,
            req.push_new_games,
            req.daily_reminder_time.as_deref(),
            req.timezone.as_deref(),
            None,
            None,
            None,
        )
        .await
        {
            tracing::warn!(target: TRACE_TARGET, %error, "push prefs upsert failed");
            return Err(ConnectError::new(
                ErrorCode::Internal,
                "preferences_update_failed",
            ));
        }
    }
    let prefs = match &state.pool {
        Some(pool) => match fetch_notification_preferences(pool, &identity.user_id).await {
            Ok(value) => prefs_from_json(&value),
            _ => NotificationPreferences::default(),
        },
        None => NotificationPreferences::default(),
    };
    Response::ok(UpdatePushPreferencesResponse {
        preferences: prefs.into(),
        ..Default::default()
    })
}

pub(super) async fn unsubscribe_email(
    state: &AppState,
    _ctx: RequestContext,
    request: ServiceRequest<'_, UnsubscribeEmailRequest>,
) -> ServiceResult<UnsubscribeEmailResponse> {
    let verifier = state
        .unsubscribe
        .as_ref()
        .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "unsubscribe_not_configured"))?;
    let req = request.to_owned_message();
    let user_id = verifier
        .verify(&req.token, chrono::Utc::now().timestamp_millis())
        .ok_or_else(|| {
            ConnectError::new(ErrorCode::InvalidArgument, "invalid_unsubscribe_token")
        })?;
    let pool = state
        .pool
        .as_ref()
        .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "preferences_unavailable"))?;
    upsert_notification_preferences(
        pool,
        &user_id.to_string(),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        Some(false),
    )
    .await
    .map_err(|error| {
        tracing::warn!(target: TRACE_TARGET, %error, "unsubscribe upsert failed");
        ConnectError::new(ErrorCode::Internal, "preferences_update_failed")
    })?;
    Response::ok(UnsubscribeEmailResponse::default())
}

pub(super) async fn update_email_preferences(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, UpdateEmailPreferencesRequest>,
) -> ServiceResult<UpdateEmailPreferencesResponse> {
    let identity = require_identity(&ctx)?;
    let req = request.to_owned_message();
    if let Some(pool) = &state.pool {
        if let Err(error) = upsert_notification_preferences(
            pool,
            &identity.user_id,
            None,
            None,
            None,
            None,
            None,
            None,
            req.email_enabled,
            req.email_weekly_digest,
            req.email_marketing,
        )
        .await
        {
            tracing::warn!(target: TRACE_TARGET, %error, "email prefs upsert failed");
            return Err(ConnectError::new(
                ErrorCode::Internal,
                "preferences_update_failed",
            ));
        }
    }
    let prefs = match &state.pool {
        Some(pool) => match fetch_notification_preferences(pool, &identity.user_id).await {
            Ok(value) => prefs_from_json(&value),
            _ => NotificationPreferences::default(),
        },
        None => NotificationPreferences::default(),
    };
    Response::ok(UpdateEmailPreferencesResponse {
        preferences: prefs.into(),
        ..Default::default()
    })
}

fn prefs_from_json(value: &serde_json::Value) -> NotificationPreferences {
    NotificationPreferences {
        push_enabled: value
            .get("pushEnabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        push_daily_reminder: value
            .get("pushDailyReminder")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        push_streak_alert: value
            .get("pushStreakAlert")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        push_new_games: value
            .get("pushNewGames")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        daily_reminder_time: value
            .get("dailyReminderTime")
            .and_then(|v| v.as_str())
            .unwrap_or("09:00")
            .to_string(),
        email_enabled: value
            .get("emailEnabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        email_weekly_digest: value
            .get("emailWeeklyDigest")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        // Marketing email is opt-in: absent means no.
        email_marketing: value
            .get("emailMarketing")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        timezone: value
            .get("timezone")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        ..Default::default()
    }
}

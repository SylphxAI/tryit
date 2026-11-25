use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::TRACE_TARGET;
use crate::bootstrap::identity::require_identity;
use crate::bootstrap::state::AppState;
use crate::capabilities::preferences::adapters::preferences_db::{
    fetch_user_preferences, upsert_user_preferences, username_taken,
};
use crate::proto::puzzled::v1::{
    CheckUsernameRequest, CheckUsernameResponse, GetProfileRequest, GetProfileResponse, Profile,
    UpdateProfileRequest, UpdateProfileResponse,
};

pub(super) async fn get_profile(
    state: &AppState,
    ctx: RequestContext,
    _request: ServiceRequest<'_, GetProfileRequest>,
) -> ServiceResult<GetProfileResponse> {
    let identity = require_identity(&ctx)?;
    let profile = match &state.pool {
        Some(pool) => match fetch_user_preferences(pool, &identity.user_id).await {
            Ok(Some(value)) => profile_from_json(&value),
            Ok(None) => Profile::default(),
            Err(error) => {
                tracing::warn!(target: TRACE_TARGET, %error, "get_profile read failed");
                return Err(ConnectError::new(
                    ErrorCode::Internal,
                    "preferences_read_failed",
                ));
            }
        },
        None => Profile::default(),
    };
    Response::ok(GetProfileResponse {
        profile: profile.into(),
        ..Default::default()
    })
}

pub(super) async fn update_profile(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, UpdateProfileRequest>,
) -> ServiceResult<UpdateProfileResponse> {
    let identity = require_identity(&ctx)?;
    let req = request.to_owned_message();
    if let Some(pool) = &state.pool {
        if let Some(username) = req.username.as_deref() {
            let username = username.trim();
            if username.is_empty() {
                return Err(ConnectError::new(
                    ErrorCode::InvalidArgument,
                    "username_required",
                ));
            }
            match username_taken(pool, &identity.user_id, username).await {
                Ok(true) => {
                    return Err(ConnectError::new(
                        ErrorCode::AlreadyExists,
                        "username_taken",
                    ));
                }
                Ok(false) => {}
                Err(error) => {
                    tracing::warn!(target: TRACE_TARGET, %error, "username check failed");
                    return Err(ConnectError::new(
                        ErrorCode::Internal,
                        "username_check_failed",
                    ));
                }
            }
        }
        if let Err(error) = upsert_user_preferences(
            pool,
            &identity.user_id,
            req.username.as_deref(),
            req.bio.as_deref(),
            req.is_public_profile,
            req.compact_mode,
            req.leaderboard_visible,
        )
        .await
        {
            tracing::warn!(target: TRACE_TARGET, %error, "profile upsert failed");
            return Err(ConnectError::new(
                ErrorCode::Internal,
                "profile_update_failed",
            ));
        }
    }
    let profile = match &state.pool {
        Some(pool) => match fetch_user_preferences(pool, &identity.user_id).await {
            Ok(Some(value)) => profile_from_json(&value),
            _ => Profile::default(),
        },
        None => Profile::default(),
    };
    Response::ok(UpdateProfileResponse {
        profile: profile.into(),
        ..Default::default()
    })
}

pub(super) async fn check_username(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, CheckUsernameRequest>,
) -> ServiceResult<CheckUsernameResponse> {
    let identity = require_identity(&ctx)?;
    let req = request.to_owned_message();
    let username = req.username.trim().to_string();
    if username.is_empty() {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "username_required",
        ));
    }
    let available = match &state.pool {
        Some(pool) => match username_taken(pool, &identity.user_id, &username).await {
            Ok(taken) => !taken,
            Err(error) => {
                tracing::warn!(target: TRACE_TARGET, %error, "username check failed");
                return Err(ConnectError::new(
                    ErrorCode::Internal,
                    "username_check_failed",
                ));
            }
        },
        None => true,
    };
    Response::ok(CheckUsernameResponse {
        available,
        ..Default::default()
    })
}

fn profile_from_json(value: &serde_json::Value) -> Profile {
    Profile {
        username: value
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        bio: value
            .get("bio")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        is_public_profile: value
            .get("isPublicProfile")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        compact_mode: value
            .get("compactMode")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        leaderboard_visible: value
            .get("leaderboardVisible")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        locale: value
            .get("locale")
            .and_then(|v| v.as_str())
            .unwrap_or("en-US")
            .to_string(),
        ..Default::default()
    }
}

use sqlx::PgPool;
use uuid::Uuid;

use super::store::{lock_players, mint_cookie, token_hash};
use super::{COOKIE, VERIFIED_GUEST_HEADER};

mod legacy_claim;

use self::legacy_claim::claim_legacy;

pub fn cookie_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    let mut token = None;
    for value in headers.get_all(axum::http::header::COOKIE) {
        for pair in value.to_str().ok()?.split(';') {
            if let Some((name, value)) = pair.trim().split_once('=') {
                if name == COOKIE {
                    if token.is_some() {
                        return None;
                    }
                    token = Some(value);
                }
            }
        }
    }
    token
}

pub async fn attach_guest(
    axum::extract::State(pool): axum::extract::State<Option<PgPool>>,
    mut request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    request.headers_mut().remove(VERIFIED_GUEST_HEADER);
    if request.uri().path() == "/v1/guest/session" {
        return next.run(request).await;
    }
    // A signed subject that aliases a registered guest is not an account.
    if let (Some(pool), Ok(identity)) =
        (&pool, crate::bootstrap::identity::verify(request.headers()))
    {
        if let Ok(player) = Uuid::parse_str(&identity.user_id) {
            let result = async {
                let mut tx = crate::shared::verification_timing::begin(pool).await?;
                lock_players(&mut tx, vec![player]).await?;
                let collision: bool = sqlx::query_scalar(
                    "SELECT EXISTS (SELECT 1 FROM guest_credentials WHERE user_id = $1)",
                )
                .bind(player)
                .fetch_one(&mut *tx)
                .await?;
                tx.commit().await?;
                Ok::<_, sqlx::Error>(collision)
            }
            .await;
            match result {
                Ok(true) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"code":"unauthenticated", "message":"identity_required"}))).into_response(),
                Ok(false) => {},
                Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, axum::Json(serde_json::json!({"code":"internal", "message":"identity_store_failed"}))).into_response(),
            }
        }
    }
    if let Some(hash) = cookie_token(request.headers()).and_then(token_hash) {
        if let Ok(value) = hash.parse() {
            request.headers_mut().insert(VERIFIED_GUEST_HEADER, value);
        }
    }
    next.run(request).await
}

const LEGACY_COOKIE: &str = "puzzled_guest_id";

/// A legacy raw player id: the body field, else exactly one cookie.
fn legacy_guest_id(headers: &axum::http::HeaderMap, body: &[u8]) -> Option<Uuid> {
    if let Some(id) = serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("legacyGuestId")?
                .as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
        })
    {
        return Some(id);
    }
    let mut found = None;
    for value in headers.get_all(axum::http::header::COOKIE) {
        for pair in value.to_str().ok()?.split(';') {
            if let Some((name, value)) = pair.trim().split_once('=') {
                if name == LEGACY_COOKIE {
                    if found.is_some() {
                        return None;
                    }
                    found = Some(value.trim());
                }
            }
        }
    }
    found
        .filter(|v| v.len() == 36)
        .and_then(|v| Uuid::parse_str(v).ok())
}

pub async fn session(
    axum::extract::State(state): axum::extract::State<crate::AppState>,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let Ok(expected) = crate::shared::public_origin::public_origin() else {
        return axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if !crate::shared::public_origin::admits_browser(&headers, &expected)
        || serde_json::from_slice::<serde_json::Value>(&body).is_err()
    {
        return axum::http::StatusCode::FORBIDDEN.into_response();
    }
    let existing = cookie_token(&headers).filter(|token| token_hash(token).is_some());
    let issued = existing.is_none();
    let Ok(cookie) = mint_cookie(existing) else {
        return axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    // Without a database the claim cannot run; a 200 would make the client forget its key.
    if state.pool.is_none() && legacy_guest_id(&headers, &body).is_some() {
        return axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let mut claimed = false;
    if let (Some(pool), Some(legacy)) = (&state.pool, legacy_guest_id(&headers, &body)) {
        let hash = cookie
            .split(';')
            .next()
            .and_then(|pair| pair.split_once('='))
            .and_then(|(_, token)| token_hash(token));
        let Some(hash) = hash else {
            return axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response();
        };
        match claim_legacy(pool, &hash, legacy).await {
            Ok(done) => claimed = done,
            Err(_) => return axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    }
    let (Ok(value), Ok(expire)) = (
        cookie.parse::<axum::http::HeaderValue>(),
        format!("{LEGACY_COOKIE}=; Path=/; Max-Age=0").parse::<axum::http::HeaderValue>(),
    ) else {
        return axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let mut response = axum::Json(if claimed {
        serde_json::json!({"issued": issued, "claimed": true})
    } else {
        serde_json::json!({"issued": issued})
    })
    .into_response();
    response
        .headers_mut()
        .append(axum::http::header::SET_COOKIE, value);
    if claimed {
        response
            .headers_mut()
            .append(axum::http::header::SET_COOKIE, expire);
    }
    response
}

/// Issuance origin and JSON admission precede Auth verification and database
/// access, even when an invalid browser request supplies cookies or a bearer.
pub async fn bootstrap_guard(
    mut request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    if request.uri().path() != "/v1/guest/session" {
        return next.run(request).await;
    }
    let Ok(origin) = crate::shared::public_origin::public_origin() else {
        return axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    if !crate::shared::public_origin::admits_browser(request.headers(), &origin) {
        return axum::http::StatusCode::FORBIDDEN.into_response();
    }
    let body = std::mem::replace(request.body_mut(), axum::body::Body::empty());
    let Ok(bytes) = axum::body::to_bytes(body, 4096).await else {
        return axum::http::StatusCode::FORBIDDEN.into_response();
    };
    if serde_json::from_slice::<serde_json::Value>(&bytes).is_err() {
        return axum::http::StatusCode::FORBIDDEN.into_response();
    }
    *request.body_mut() = axum::body::Body::from(bytes);
    next.run(request).await
}

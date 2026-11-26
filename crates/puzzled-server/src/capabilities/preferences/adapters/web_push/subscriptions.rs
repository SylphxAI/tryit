use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sqlx::PgPool;
use uuid::Uuid;

// The browser's endpoint is untrusted. Only public browser push services may
// receive requests; redirects are disabled too (no internal-network fetches).
pub fn valid_endpoint(endpoint: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(endpoint) else {
        return false;
    };
    let host = url.host_str().unwrap_or_default();
    url.scheme() == "https"
        && url.port().is_none_or(|port| port == 443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && endpoint.len() <= 4096
        && PUSH_SERVICE_SUFFIXES.iter().any(|suffix| {
            host.strip_suffix(suffix)
                .is_some_and(|label| !label.is_empty())
        })
}

// Browser push services publish many regional hosts (Chrome now hands out
// hosts such as jmt17.google.com), so match by domain suffix on a label
// boundary. IP literals never end in these suffixes.
const PUSH_SERVICE_SUFFIXES: [&str; 5] = [
    ".googleapis.com",
    ".google.com",
    ".push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
];

pub fn valid_keys(p256dh: &str, auth: &str) -> bool {
    URL_SAFE_NO_PAD
        .decode(p256dh)
        .is_ok_and(|key| key.len() == 65 && key[0] == 4)
        && URL_SAFE_NO_PAD
            .decode(auth)
            .is_ok_and(|key| key.len() == 16)
}

pub async fn save(
    pool: &PgPool,
    player: Uuid,
    endpoint: &str,
    p256dh: &str,
    auth: &str,
    locale: &str,
) -> Result<(), sqlx::Error> {
    // Endpoint knowledge and shaped keys are not proof of browser possession.
    // Only its existing owner may rotate keys; account switches must obtain a
    // fresh browser subscription after explicitly unsubscribing the old one.
    let mut transaction = pool.begin().await?;
    let saved = sqlx::query("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth WHERE push_subscriptions.user_id = EXCLUDED.user_id")
        .bind(Uuid::now_v7()).bind(player).bind(endpoint).bind(p256dh).bind(auth).execute(&mut *transaction).await?;
    if saved.rows_affected() == 0 {
        transaction.rollback().await?;
        return Err(sqlx::Error::RowNotFound);
    }
    sqlx::query("INSERT INTO user_preferences (user_id, locale) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET locale = EXCLUDED.locale")
        .bind(player).bind(locale).execute(&mut *transaction).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn remove(pool: &PgPool, player: Uuid, endpoint: &str) -> Result<(), sqlx::Error> {
    let removed =
        sqlx::query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2")
            .bind(player)
            .bind(endpoint)
            .execute(pool)
            .await?;
    if removed.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

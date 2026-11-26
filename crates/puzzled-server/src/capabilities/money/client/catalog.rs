use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;

use super::transport::redact_error;
use super::{Money, MoneyError};

/// How long a read catalogue is reused.
pub const CATALOG_CACHE_TTL: Duration = Duration::from_secs(300);
pub(super) type CatalogSlot = Option<(Instant, Arc<Catalog>)>;

/// A catalogue price as `GET price_catalogs/default` publishes it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CatalogPrice {
    pub key: String,
    #[serde(default)]
    pub recurring_interval: Option<String>,
    #[serde(default)]
    pub tax_behavior: Option<String>,
    #[serde(default)]
    pub archived: bool,
    /// Free trial days before the first charge; 0 or absent: no trial.
    #[serde(default)]
    pub trial_days: u32,
    /// Upper-case ISO 4217 code to minor units, as a decimal string.
    #[serde(default)]
    pub unit_amounts: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CatalogLicence {
    pub term: CatalogLicenceTerm,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CatalogLicenceTerm {
    pub unit: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CatalogProduct {
    pub key: String,
    /// Feature grants: `plus`/`family` are `"true"`, `seats` a decimal string.
    #[serde(default)]
    pub features: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub prices: Vec<CatalogPrice>,
    #[serde(default)]
    pub licence: Option<CatalogLicence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize)]
pub struct Catalog {
    #[serde(default)]
    pub spec: CatalogSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize)]
pub struct CatalogSpec {
    #[serde(default)]
    pub products: Vec<CatalogProduct>,
}

impl Catalog {
    /// Every price of every product.
    pub fn prices(&self) -> impl Iterator<Item = &CatalogPrice> {
        self.spec.products.iter().flat_map(|p| p.prices.iter())
    }
}

impl Money {
    /// The default catalogue, cached five minutes.
    pub async fn catalog(&self) -> Result<Arc<Catalog>, MoneyError> {
        if let Some((at, catalog)) = self.catalog.lock().ok().and_then(|c| c.clone()) {
            if at.elapsed() < CATALOG_CACHE_TTL {
                return Ok(catalog);
            }
        }
        let environment = self.environment_resource().await?;
        let body = crate::shared::verification_timing::money(self.sdk.invoke(
            "money.price_catalogs.get",
            json!({
                "name": format!("{}/price_catalogs/default", environment),
            }),
        ))
        .await
        .map_err(|e| self.map_sdk_error(e))?;
        let catalog: Arc<Catalog> = Arc::new(serde_json::from_value(body).map_err(|e| {
            MoneyError::Unavailable(format!(
                "unreadable catalogue: {}",
                redact_error(&e.to_string(), &self.secret_key)
            ))
        })?);
        if let Ok(mut slot) = self.catalog.lock() {
            *slot = Some((Instant::now(), catalog.clone()));
        }
        Ok(catalog)
    }
}

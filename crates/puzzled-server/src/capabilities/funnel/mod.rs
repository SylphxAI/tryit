//! First-party funnel counter. Rows are anonymous (no user id, IP or cookie).
//! Read them with plain SQL, e.g. `SELECT event, count(*) FROM funnel_events GROUP BY 1`.

mod persistence;
mod validation;

pub use persistence::{insert, record_signup};
pub use validation::validate_browser;

use serde::Deserialize;
use serde_json::Value;

/// One event as the browser sends it. Unknown fields are ignored.
#[derive(Debug, Deserialize, Default)]
pub struct Incoming {
    pub event: String,
    pub path: Option<String>,
    pub game_slug: Option<String>,
    pub metric: Option<String>,
    pub value: Option<f64>,
    pub rating: Option<String>,
    pub mode: Option<String>,
    pub status: Option<String>,
    pub pick_index: Option<u32>,
    pub time_bucket_s: Option<u32>,
    pub is_guest: Option<bool>,
    pub progress_pct_bucket: Option<u32>,
    pub hint_count: Option<u32>,
    pub action: Option<String>,
    pub has_percentile: Option<bool>,
    pub surface: Option<String>,
    pub picks_used: Option<u32>,
    pub currency: Option<String>,
    pub platform: Option<String>,
    pub trigger: Option<String>,
    pub result: Option<String>,
}

/// A checked row, ready to store.
#[derive(Debug, PartialEq)]
pub struct Row {
    pub event: &'static str,
    pub path: Option<String>,
    pub game_slug: Option<String>,
    pub metric: Option<&'static str>,
    pub value: Option<f64>,
    pub rating: Option<&'static str>,
    pub params: Option<Value>,
}

#[cfg(test)]
mod tests;

//! Browser subscriptions are player-scoped; delivery uses RFC 8291/8292 directly.

mod delivery;
mod payload;
mod subscriptions;
#[cfg(test)]
mod tests;

pub use delivery::{deliver_subscriptions, deliver_subscriptions_until, send_daily};
pub use payload::reminder_payload;
pub use subscriptions::{remove, save, valid_endpoint, valid_keys};

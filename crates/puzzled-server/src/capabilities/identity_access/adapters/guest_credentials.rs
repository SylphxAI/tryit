//! Server-issued browser identity; public player ids are not credentials.

mod middleware;
mod store;

pub use middleware::{attach_guest, bootstrap_guard, cookie_token, session};
#[cfg(test)]
pub use store::issue;
#[cfg(test)]
pub(crate) use store::issue_with_first_candidate;
pub use store::{
    account_backed, lock_players, lookup_hash, mint_cookie, token_hash, unused_player,
    validate_locked,
};

pub const COOKIE: &str = "__Host-puzzled_guest";
pub const VERIFIED_GUEST_HEADER: &str = "x-puzzled-verified-guest";

// The pre-rollout migration refuses any former billing row before this
// release removes those tables from identity classification. Existing account
// markers remain authoritative; no guest can adopt a billing-only historic id.
pub(crate) const ACCOUNT_BACKED: &str = "EXISTS (SELECT 1 FROM auth_subjects WHERE user_id = $1) OR EXISTS (SELECT 1 FROM user_preferences WHERE user_id = $1) OR EXISTS (SELECT 1 FROM user_display_cache WHERE user_id = $1) OR EXISTS (SELECT 1 FROM notification_preferences WHERE user_id = $1) OR EXISTS (SELECT 1 FROM family_groups WHERE owner_user_id = $1) OR EXISTS (SELECT 1 FROM family_members WHERE owner_user_id = $1 OR member_user_id = $1) OR EXISTS (SELECT 1 FROM account_attribution WHERE user_id = $1) OR EXISTS (SELECT 1 FROM checkout_consents WHERE user_id = $1) OR EXISTS (SELECT 1 FROM win_back_emails WHERE user_id = $1) OR EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = $1) OR EXISTS (SELECT 1 FROM guest_credentials WHERE adopted_user_id = $1)";

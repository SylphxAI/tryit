//! SQL adapters for the admin operations surface.

mod announcements;
mod audit_logs;
mod dead_letter_queue;
mod game_analytics;
mod settings;

pub use announcements::{
    create_announcement, delete_announcement, list_announcements, parse_announcement_bound,
    update_announcement, validate_announcement_window,
};
pub use audit_logs::{get_audit_log, list_audit_logs};
pub use dead_letter_queue::{dlq_mark_failed, dlq_resolve, dlq_retry, list_dlq};
pub use game_analytics::{game_analytics, games_overview};
pub use settings::{list_settings, upsert_setting};

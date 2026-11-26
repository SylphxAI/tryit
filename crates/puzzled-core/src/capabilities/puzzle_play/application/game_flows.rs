//! Pure puzzle-play application flows (daily status, archive access, save planning).
//!
//! Clock and HTTP stay in the shell; these functions take explicit dates and inputs.

mod daily_archive;
mod save_result;
mod types;

pub use daily_archive::{
    build_archive_dates, build_daily_status, check_archive_access, ArchiveAccessError,
    ArchiveDateEntry, DailyPuzzleMeta, DailyStatusResponse,
};
pub use save_result::{plan_save_result, SaveResultError, SaveResultInput, SaveResultPlan};
pub use types::{map_session_difficulty, ClaimedStatus, GameMode, RouteDifficulty};

//! Native Connect PuzzleService — server-authoritative play (ADR-170).
//!
//! - Solutions never leave the server.
//! - GetDaily serves the stored/generated puzzle data only; completion is
//!   derived from the user's sessions, never from a client flag.
//! - SubmitGuess resolves the served puzzle itself (puzzle_id or puzzle_date),
//!   validates the final submission against the server's solution via the
//!   pure dispatch, and persists the verified result. Client seeds/verdicts
//!   are never trusted.

mod admission;
mod daily;
mod five_admission;
mod grade;
mod progress;
mod puzzle;
mod share;
mod submit;
mod submit_puzzle;

use std::collections::HashMap;
use std::sync::Arc;

use chrono::NaiveDate;
use connectrpc::{ConnectError, RequestContext, ServiceRequest, ServiceResult};
use puzzled_core::puzzle_play::domain::scoring::SubmissionStatus;

use super::connect_practice::{self, PracticeGuessBudget};
use super::state::AppState;
use crate::proto::puzzled::v1::{
    CheckGuessRequest, CheckGuessResponse, CheckPracticeGuessRequest, GetDailyRequest,
    GetDailyResponse, GetPracticePuzzleRequest, GetPracticePuzzleResponse, GetPuzzleRequest,
    GetPuzzleResponse, GetSharedResultRequest, GetSharedResultResponse, GetTodayProgressRequest,
    GetTodayProgressResponse, PuzzleService, RecordShareLandingRequest, RecordShareLandingResponse,
    ShareResultRequest, ShareResultResponse, StartDailyRequest, StartDailyResponse,
    SubmitGuessRequest, SubmitGuessResponse, SubmitPracticeRequest, SubmitPracticeResponse,
};

// Keep the original tracing target when handlers move into child modules.
const TRACE_TARGET: &str = module_path!();

#[derive(Clone)]
pub struct PuzzleConnectService {
    state: AppState,
    practice_guesses: PracticeGuessBudget,
    /// Graded guesses per (player, game, day, difficulty), capped at the
    /// game's own guess limit so CheckGuess cannot be used to search for the
    /// answer. Per process and per day; cleared when the day changes.
    guesses: Arc<std::sync::Mutex<(NaiveDate, HashMap<String, u32>)>>,
}

impl PuzzleConnectService {
    pub fn new(state: AppState) -> Self {
        Self {
            state,
            practice_guesses: PracticeGuessBudget::default(),
            guesses: Arc::new(std::sync::Mutex::new((NaiveDate::MIN, HashMap::new()))),
        }
    }

    /// Reassign accepted guest rows onto the Platform account before a personal
    /// read or write. Fail closed so a missed merge cannot accept a second finish.
    async fn adopt_guest_progress_if_needed(
        &self,
        ctx: &RequestContext,
        guest_write: bool,
    ) -> Result<crate::bootstrap::identity::RequestAccess, ConnectError> {
        crate::bootstrap::identity::admitted_request_identities(
            ctx,
            self.state.pool.as_ref(),
            guest_write,
        )
        .await
    }
}

pub(super) fn parse_status(raw: &str) -> Option<SubmissionStatus> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "won" => Some(SubmissionStatus::Won),
        "lost" => Some(SubmissionStatus::Lost),
        _ => None,
    }
}

pub(super) fn status_label(s: SubmissionStatus) -> &'static str {
    match s {
        SubmissionStatus::Won => "won",
        SubmissionStatus::Lost => "lost",
    }
}

fn date_from_string(raw: Option<&str>) -> Option<NaiveDate> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok()
}

#[allow(refining_impl_trait_internal, refining_impl_trait_reachable)]
impl PuzzleService for PuzzleConnectService {
    async fn get_practice_puzzle(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetPracticePuzzleRequest>,
    ) -> ServiceResult<GetPracticePuzzleResponse> {
        connect_practice::get(&self.state, &ctx, request.to_owned_message()).await
    }

    async fn check_practice_guess(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CheckPracticeGuessRequest>,
    ) -> ServiceResult<CheckGuessResponse> {
        connect_practice::check_guess(
            &self.state,
            &self.practice_guesses,
            &ctx,
            request.to_owned_message(),
        )
        .await
    }

    async fn submit_practice(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, SubmitPracticeRequest>,
    ) -> ServiceResult<SubmitPracticeResponse> {
        connect_practice::submit(&self.state, &ctx, request.to_owned_message()).await
    }

    async fn record_share_landing(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, RecordShareLandingRequest>,
    ) -> ServiceResult<RecordShareLandingResponse> {
        self.record_share_landing_rpc(ctx, request).await
    }

    async fn get_puzzle(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetPuzzleRequest>,
    ) -> ServiceResult<GetPuzzleResponse> {
        self.get_puzzle_rpc(ctx, request).await
    }

    async fn get_daily(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetDailyRequest>,
    ) -> ServiceResult<GetDailyResponse> {
        self.get_daily_rpc(ctx, request).await
    }

    async fn start_daily(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, StartDailyRequest>,
    ) -> ServiceResult<StartDailyResponse> {
        self.start_daily_rpc(ctx, request).await
    }

    async fn get_today_progress(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetTodayProgressRequest>,
    ) -> ServiceResult<GetTodayProgressResponse> {
        self.get_today_progress_rpc(ctx, request).await
    }

    async fn submit_guess(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, SubmitGuessRequest>,
    ) -> ServiceResult<SubmitGuessResponse> {
        self.submit_guess_rpc(ctx, request).await
    }

    async fn check_guess(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CheckGuessRequest>,
    ) -> ServiceResult<CheckGuessResponse> {
        self.check_guess_rpc(ctx, request).await
    }

    async fn share_result(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ShareResultRequest>,
    ) -> ServiceResult<ShareResultResponse> {
        self.share_result_rpc(ctx, request).await
    }

    async fn get_shared_result(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetSharedResultRequest>,
    ) -> ServiceResult<GetSharedResultResponse> {
        self.get_shared_result_rpc(ctx, request).await
    }
}

pub fn puzzle_connect_service(state: AppState) -> Arc<PuzzleConnectService> {
    Arc::new(PuzzleConnectService::new(state))
}

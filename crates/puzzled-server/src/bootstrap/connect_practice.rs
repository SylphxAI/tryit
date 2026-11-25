//! Plus-only practice. No daily storage, guest adoption, or ritual side effects.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use connectrpc::{ConnectError, ErrorCode, RequestContext, Response, ServiceResult};
use puzzled_core::puzzle_play::application::guess_grading::guess_limit;
use puzzled_core::puzzle_play::application::practice::{PracticeBoard, PracticePuzzle};
use puzzled_core::puzzle_play::application::submission_validation::SubmissionEnvelope;
use serde_json::Value;

use super::connect_puzzle::{parse_status, status_label};
use super::identity::require_identity;
use super::state::AppState;
use crate::capabilities::billing::service::access as entitlement_access;
use crate::proto::puzzled::v1::{
    CheckGuessResponse, CheckPracticeGuessRequest, GetPracticePuzzleRequest,
    GetPracticePuzzleResponse, SubmitPracticeRequest, SubmitPracticeResponse,
};

const GUESS_WINDOW: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_TRACKED_PUZZLES: usize = 65_536;

type GuessKey = (String, PracticePuzzle);

/// Like daily guess accounting, this is process-local. Keep memory bounded
/// for client-chosen seeds; never evict a live key just to admit a new one.
#[derive(Clone)]
pub(super) struct PracticeGuessBudget(Arc<Mutex<(Instant, HashMap<GuessKey, u32>)>>);

impl Default for PracticeGuessBudget {
    fn default() -> Self {
        Self(Arc::new(Mutex::new((Instant::now(), HashMap::new()))))
    }
}

impl PracticeGuessBudget {
    fn take(&self, key: GuessKey, limit: u32) -> Result<(), ConnectError> {
        let exhausted =
            || ConnectError::new(ErrorCode::ResourceExhausted, "practice_guess_capacity");
        let mut budget = self.0.lock().map_err(|_| exhausted())?;
        if budget.0.elapsed() >= GUESS_WINDOW {
            *budget = (Instant::now(), HashMap::new());
        }
        if budget.1.len() >= MAX_TRACKED_PUZZLES && !budget.1.contains_key(&key) {
            return Err(exhausted());
        }
        let used = budget.1.entry(key).or_default();
        if *used >= limit {
            return Err(ConnectError::new(
                ErrorCode::ResourceExhausted,
                "guess_limit_reached",
            ));
        }
        *used += 1;
        Ok(())
    }
}

async fn require_practice_access(
    state: &AppState,
    ctx: &RequestContext,
) -> Result<String, ConnectError> {
    let uid = require_identity(ctx)
        .map_err(|_| {
            ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_practice")
        })?
        .user_id;
    let denied = || ConnectError::new(ErrorCode::PermissionDenied, "plus_required_for_practice");
    // Configured Money with an unavailable database is not a closed sales period.
    if state.money.is_some() && state.pool.is_none() {
        return Err(denied());
    }
    if state.try_sales_open().await.map_err(|_| denied())? {
        let pool = state.pool.as_ref().ok_or_else(denied)?;
        if !matches!(entitlement_access(pool, state.money.as_ref(), &uid).await, Ok(found) if found.entitled)
        {
            return Err(denied());
        }
    }
    Ok(uid)
}

fn invalid(message: impl Into<String>) -> ConnectError {
    ConnectError::new(ErrorCode::InvalidArgument, message.into())
}

fn generate(puzzle: PracticePuzzle) -> Result<PracticeBoard, ConnectError> {
    puzzle
        .generate()
        .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "practice_puzzle_unavailable"))
}

fn fresh_seed() -> Result<i64, ConnectError> {
    let mut bytes = [0; 8];
    getrandom::fill(&mut bytes)
        .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "practice_seed_unavailable"))?;
    Ok((i64::from_le_bytes(bytes) & i64::MAX).max(1))
}

pub(super) async fn get(
    state: &AppState,
    ctx: &RequestContext,
    req: GetPracticePuzzleRequest,
) -> ServiceResult<GetPracticePuzzleResponse> {
    require_practice_access(state, ctx).await?;
    let seed = if req.practice_seed == 0 {
        fresh_seed()?
    } else {
        req.practice_seed
    };
    let puzzle = PracticePuzzle::new(&req.game_slug, seed, &req.difficulty).map_err(invalid)?;
    let board = generate(puzzle)?;
    Response::ok(GetPracticePuzzleResponse {
        game_slug: puzzle.game().into(),
        practice_seed: seed,
        difficulty: puzzle.difficulty().unwrap_or_default().into(),
        puzzle_data_json: board.client_data().to_string(),
        ..Default::default()
    })
}

pub(super) async fn check_guess(
    state: &AppState,
    budget: &PracticeGuessBudget,
    ctx: &RequestContext,
    req: CheckPracticeGuessRequest,
) -> ServiceResult<CheckGuessResponse> {
    let uid = require_practice_access(state, ctx).await?;
    let puzzle =
        PracticePuzzle::new(&req.game_slug, req.practice_seed, &req.difficulty).map_err(invalid)?;
    let limit = guess_limit(puzzle.game()).ok_or_else(|| invalid("game_not_graded_per_guess"))?;
    let guess = serde_json::from_str(&req.guess_json).map_err(|_| invalid("invalid_guess_json"))?;
    let result = generate(puzzle)?.grade(&guess).map_err(invalid)?;
    budget.take((uid, puzzle), limit)?;
    Response::ok(CheckGuessResponse {
        result_json: result.to_string(),
        ..Default::default()
    })
}

pub(super) async fn submit(
    state: &AppState,
    ctx: &RequestContext,
    req: SubmitPracticeRequest,
) -> ServiceResult<SubmitPracticeResponse> {
    require_practice_access(state, ctx).await?;
    let puzzle =
        PracticePuzzle::new(&req.game_slug, req.practice_seed, &req.difficulty).map_err(invalid)?;
    let status = parse_status(&req.status).ok_or_else(|| invalid("status_required_won_or_lost"))?;
    let data = if req.submission_json.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&req.submission_json)
            .map_err(|_| invalid("invalid_submission_json"))?
    };
    let (verdict, reveal) = generate(puzzle)?.finish(&SubmissionEnvelope {
        status,
        attempts: req.attempts,
        time_spent_ms: req.time_spent_ms,
        data,
    });
    Response::ok(SubmitPracticeResponse {
        valid: verdict.valid,
        status: verdict.status.map(status_label).unwrap_or_default().into(),
        score: verdict.score,
        game_slug: puzzle.game().into(),
        error: verdict.error,
        reveal_json: reveal.map(|solution| solution.to_string()),
        ..Default::default()
    })
}

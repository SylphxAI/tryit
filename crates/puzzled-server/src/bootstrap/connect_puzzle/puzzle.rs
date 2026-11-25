use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use puzzled_core::puzzle_play::crossword_generate::client_safe_puzzle_data;
use puzzled_core::{generate_sudoku_puzzle, SudokuDifficulty};

use super::PuzzleConnectService;
use crate::proto::puzzled::v1::{GetPuzzleRequest, GetPuzzleResponse};

const SLICE_PUZZLE: &str = "S2-puzzle-connect";

impl PuzzleConnectService {
    pub(super) async fn get_puzzle_rpc(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, GetPuzzleRequest>,
    ) -> ServiceResult<GetPuzzleResponse> {
        let req = request.to_owned_message();
        let game_slug = req.game_slug.trim();
        if game_slug.is_empty() {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "game_slug_required",
            ));
        }
        if game_slug != "sudoku" {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "unsupported_game_slug",
            ));
        }

        let difficulty = parse_difficulty(&req.difficulty);
        let puzzle_data = sudoku_puzzle_data(req.seed, difficulty);

        Response::ok(GetPuzzleResponse {
            game_slug: game_slug.to_string(),
            seed: req.seed,
            difficulty: difficulty_label(difficulty).to_string(),
            puzzle_data_json: client_safe_puzzle_data(puzzle_data).to_string(),
            slice: SLICE_PUZZLE.to_string(),
            ..Default::default()
        })
    }
}

fn parse_difficulty(raw: &str) -> SudokuDifficulty {
    match raw.trim().to_ascii_lowercase().as_str() {
        "easy" => SudokuDifficulty::Easy,
        "hard" => SudokuDifficulty::Hard,
        _ => SudokuDifficulty::Medium,
    }
}

fn difficulty_label(d: SudokuDifficulty) -> &'static str {
    match d {
        SudokuDifficulty::Easy => "easy",
        SudokuDifficulty::Medium => "medium",
        SudokuDifficulty::Hard => "hard",
    }
}

fn sudoku_puzzle_data(seed: i64, difficulty: SudokuDifficulty) -> Value {
    let generated = generate_sudoku_puzzle(seed, difficulty);
    serde_json::to_value(&generated.puzzle_data).unwrap_or(Value::Null)
}

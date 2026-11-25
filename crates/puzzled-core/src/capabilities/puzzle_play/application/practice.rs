//! Seeded practice uses the existing game generators, not the daily store.

use serde_json::Value;

use super::super::domain::crossword_generate::client_safe_puzzle_data;
use super::super::domain::game_slugs::canonicalize_game_slug;
use super::super::generate::{generate_seeded, served_payload, DIFFICULTIES, DIFFICULTY_GAMES};
use super::guess_grading::grade_guess;
use super::submission_validation::{validate_submission, SubmissionEnvelope, SubmissionVerdict};

pub const PRACTICE_GAMES: [&str; 12] = [
    "sudoku",
    "word-guess",
    "quad-words",
    "crowns",
    "nonogram",
    "pattern-match",
    "killer-sudoku",
    "duo",
    "arithmo",
    "block-slide",
    "pip-place",
    "number-path",
];

/// Stable, versioned FNV-1a domain separation. Keep the result outside the
/// calendar seed range (including chrono's largest date), but small enough
/// for the legacy generators' floating-point LCG and their retry offsets.
/// This separates seed namespaces; finite puzzle banks can still repeat.
#[must_use]
pub fn practice_internal_seed(game_slug: &str, practice_seed: i64) -> i64 {
    let hash = b"tryit:practice:v1\0"
        .iter()
        .copied()
        .chain(canonicalize_game_slug(game_slug).bytes())
        .chain([0])
        .chain(practice_seed.to_le_bytes())
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        });
    3_000_000_000 + ((hash ^ (hash >> 32)) & 0x3fff_ffff) as i64
}

/// Canonical descriptor shared by fetch, guess limits, and final validation.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct PracticePuzzle {
    game: &'static str,
    seed: i64,
    difficulty: Option<usize>,
}

impl PracticePuzzle {
    pub fn new(game: &str, seed: i64, difficulty: &str) -> Result<Self, &'static str> {
        let slug = canonicalize_game_slug(game);
        let game = PRACTICE_GAMES
            .into_iter()
            .find(|&game| game == slug)
            .ok_or("practice_not_supported")?;
        if seed <= 0 {
            return Err("invalid_practice_seed");
        }
        let difficulty = DIFFICULTY_GAMES.contains(&game).then(|| {
            DIFFICULTIES
                .iter()
                .position(|d| d.eq_ignore_ascii_case(difficulty.trim()))
                .unwrap_or(1)
        });
        Ok(Self {
            game,
            seed,
            difficulty,
        })
    }

    pub fn game(self) -> &'static str {
        self.game
    }

    pub fn difficulty(self) -> Option<&'static str> {
        self.difficulty.map(|index| DIFFICULTIES[index])
    }

    pub fn generate(self) -> Result<PracticeBoard, String> {
        let seed = practice_internal_seed(self.game, self.seed)
            + self.difficulty.unwrap_or_default() as i64;
        let (data, solution) = generate_seeded(self.game, seed, self.difficulty())?;
        Ok(PracticeBoard {
            game: self.game,
            data,
            solution,
        })
    }
}

pub struct PracticeBoard {
    game: &'static str,
    data: Value,
    solution: Value,
}

impl PracticeBoard {
    pub fn client_data(&self) -> Value {
        // The shared serving policy removes the four stored quad-words answers;
        // the recursive sanitizer strips embedded answer fields across games.
        client_safe_puzzle_data(served_payload(self.game, &self.data, &self.solution))
    }

    pub fn grade(&self, guess: &Value) -> Result<Value, String> {
        grade_guess(self.game, &self.solution, guess)
    }

    pub fn finish(self, envelope: &SubmissionEnvelope) -> (SubmissionVerdict, Option<Value>) {
        let verdict = validate_submission(self.game, &self.data, &self.solution, envelope);
        let reveal = (verdict.valid && verdict.status.is_some()).then_some(self.solution);
        (verdict, reveal)
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::generate;
    use super::*;

    #[test]
    fn date_seed_uses_a_different_solution_in_each_practice_game() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 11, 25).unwrap();
        for game in PRACTICE_GAMES {
            let puzzle = PracticePuzzle::new(game, 20_261_125, "").unwrap();
            let board = puzzle.generate().unwrap();
            let daily = generate::generate(game, date, puzzle.difficulty()).unwrap();
            assert_ne!(board.solution, daily.solution, "{game}");
            assert_eq!(
                board.solution,
                puzzle.generate().unwrap().solution,
                "{game}"
            );
        }
    }

    #[test]
    fn canonical_descriptor_preserves_only_supported_difficulties() {
        let duo = PracticePuzzle::new("duo", 1, "").unwrap();
        assert_eq!(PracticePuzzle::new("tango", 1, "hard"), Ok(duo));
        assert_eq!(duo.game(), "duo");
        assert_eq!(duo.difficulty(), None);
        assert_eq!(
            practice_internal_seed("tango", 1),
            practice_internal_seed("duo", 1)
        );

        for game in ["killer-sudoku", "block-slide"] {
            for level in DIFFICULTIES {
                let canonical = PracticePuzzle::new(game, 1, level).unwrap();
                let padded_uppercase = format!(" {} ", level.to_ascii_uppercase());
                assert_eq!(
                    PracticePuzzle::new(game, 1, &padded_uppercase),
                    Ok(canonical)
                );
                assert_eq!(canonical.difficulty(), Some(level));
            }
            for omitted_or_invalid in ["", "unknown"] {
                assert_eq!(
                    PracticePuzzle::new(game, 1, omitted_or_invalid)
                        .unwrap()
                        .difficulty(),
                    Some("medium")
                );
            }
        }
    }

    #[test]
    fn seed_namespace_is_stable_and_outside_calendar_range() {
        let date_max = generate::seed_for(chrono::NaiveDate::MAX, Some("hard"));
        for game in PRACTICE_GAMES {
            for seed in [1, 20_261_125, i64::MAX] {
                let internal = practice_internal_seed(game, seed);
                assert!(internal > date_max);
                assert!(internal <= i64::from(u32::MAX));
            }
        }
        assert_eq!(
            practice_internal_seed("queens", 1),
            practice_internal_seed("crowns", 1)
        );
        assert_ne!(
            practice_internal_seed("sudoku", 1),
            practice_internal_seed("crowns", 1)
        );
    }
}

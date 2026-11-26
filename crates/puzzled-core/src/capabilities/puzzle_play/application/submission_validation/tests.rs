use super::{has_server_validator, validate_submission, SubmissionEnvelope, SubmissionStatus};
use serde_json::{json, Value};

mod logic;
mod numbers;
mod spatial;
mod word_deduction;
mod word_grid;
mod wordplay;

fn env(data: Value) -> SubmissionEnvelope {
    SubmissionEnvelope {
        status: SubmissionStatus::Won,
        attempts: 1,
        time_spent_ms: 1000,
        data,
    }
}

fn lost_env(data: Value) -> SubmissionEnvelope {
    let mut envelope = env(data);
    envelope.status = SubmissionStatus::Lost;
    envelope
}

#[test]
fn unknown_game_fails_closed() {
    let v = validate_submission("no-such-game", &json!({}), &json!({}), &env(json!({})));
    assert!(!v.valid);
    assert!(!has_server_validator("no-such-game"));
    assert!(!has_server_validator("brand-new-module"));
}

#[test]
fn every_catalog_slug_has_a_server_validator() {
    use crate::capabilities::puzzle_play::domain::game_slugs::all_game_slugs;
    for slug in all_game_slugs() {
        assert!(
            has_server_validator(slug),
            "{slug} is customer-catalogued without a server validator"
        );
        let v = validate_submission(slug, &json!({}), &json!({}), &env(json!({})));
        assert!(
            v.error
                .as_deref()
                .is_none_or(|e| !e.starts_with("unsupported game slug:")),
            "{slug} dispatch must not be unsupported: {v:?}"
        );
    }
    assert!(has_server_validator("queens"));
    assert!(has_server_validator("tango"));
}

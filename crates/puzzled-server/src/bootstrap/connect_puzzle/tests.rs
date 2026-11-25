use super::*;

fn session(score: i32) -> CompletedSession {
    CompletedSession {
        status: "won".into(),
        score: Some(score),
        attempts: 2,
        completed_at: None,
        difficulty: Some("medium".into()),
        time_spent_ms: Some(34_567),
    }
}

#[test]
fn aliases_resolve_to_storage_slugs_and_keep_the_requested_name() {
    let slugs = progress_slugs(&["queens".to_string(), "sudoku".to_string()]).unwrap();
    assert_eq!(slugs[0], ("queens".to_string(), "crowns".to_string()));
    assert_eq!(slugs[1].1, "sudoku");
}

#[test]
fn unknown_empty_and_oversized_requests_are_refused() {
    assert!(progress_slugs(&["nope".to_string()]).is_err());
    assert!(progress_slugs(&["  ".to_string()]).is_err());
    let many = vec!["sudoku".to_string(); MAX_PROGRESS_SLUGS + 1];
    assert!(progress_slugs(&many).is_err());
}

#[test]
fn only_finished_games_are_flagged_and_order_is_kept() {
    let slugs = progress_slugs(&["sudoku".to_string(), "queens".to_string()]).unwrap();
    let mut finished = HashMap::new();
    finished.insert("crowns".to_string(), session(80));
    let out = progress_entries(&slugs, &finished);
    assert_eq!(out[0].game_slug, "sudoku");
    assert!(!out[0].has_completed);
    assert!(out[0].completed_session.is_unset());
    assert_eq!(out[1].game_slug, "queens");
    assert!(out[1].has_completed);
    assert_eq!(out[1].completed_session.score, Some(80));
    assert_eq!(out[1].completed_session.time_spent_ms, Some(34_567));
    assert_eq!(
        out[1].completed_session.difficulty.as_deref(),
        Some("medium")
    );
}

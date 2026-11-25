use super::parse_user_id;
use puzzled_core::puzzle_play::ritual_completion::{
    build_ritual_completed, qualifies_as_ritual, submit_must_guard_already_played, FinishKind,
    RitualQualifyInput,
};

#[test]
fn ritual_fields_derived_for_daily_won() {
    let day = chrono::NaiveDate::from_ymd_opt(2026, 8, 12).expect("d");
    assert!(qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "won",
        is_dry_run: false,
    }));
    let ev = build_ritual_completed("u1", "sudoku", day, "won", Some("p1".into()), 0).expect("ev");
    assert_eq!(ev.finish_kind, FinishKind::Success);
    assert_eq!(ev.day_key, "2026-08-12");
    assert!(ev.is_ritual);
}

/// Shell policy: pre-check + unique index cover null puzzle_id double-finish.
#[test]
fn dogfood_double_finish_requires_date_or_ritual_guard() {
    // Historical bug: only called has_completed_session when pid was Some.
    assert!(submit_must_guard_already_played(true, None, true));
    assert!(!submit_must_guard_already_played(false, None, true));
}

/// Live tip b3abfd8/#76: guest SubmitGuess past identity gate then
/// `session_lookup_failed` because `guest_<uuid>` was parsed as a UUID.
#[test]
fn guest_logical_user_id_maps_to_storage_uuid() {
    let uid = parse_user_id("guest_a1b2c3d4-e5f6-7890-abcd-ef1234567890").expect("guest");
    assert_eq!(uid.to_string(), "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    let platform = parse_user_id("f715210b-9df3-4945-b5bd-94fc4609bc30").expect("platform");
    assert_eq!(platform.to_string(), "f715210b-9df3-4945-b5bd-94fc4609bc30");
    assert!(parse_user_id("not-a-uuid").is_err());
}

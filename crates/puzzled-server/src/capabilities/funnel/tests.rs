use serde_json::{json, Value};

use super::{validate_browser, validation::clean_path, Incoming};

fn incoming(json: &str) -> Incoming {
    serde_json::from_str(json).unwrap()
}

#[test]
fn browsers_cannot_send_signup_or_unknown_events() {
    assert!(validate_browser(&incoming(r#"{"event":"signup"}"#)).is_none());
    assert!(validate_browser(&incoming(r#"{"event":"purchase"}"#)).is_none());
}

#[test]
fn landing_keeps_only_the_path_without_query() {
    let row =
        validate_browser(&incoming(r#"{"event":"landing","path":"/pricing?x=1#a"}"#)).unwrap();
    assert_eq!(row.path.as_deref(), Some("/pricing"));
    let row = validate_browser(&incoming(r#"{"event":"landing","path":"http://x"}"#)).unwrap();
    assert_eq!(row.path, None);
}

#[test]
fn private_paths_are_not_retained() {
    for path in [
        "/account/alice",
        "/share/private-id",
        "/login/alice@example.com",
    ] {
        assert_eq!(clean_path(path), None);
    }
    assert_eq!(
        clean_path("/zh-HK/pricing?token=secret"),
        Some("/pricing".to_owned())
    );
    assert_eq!(clean_path("/games/sudoku"), Some("/games/:slug".to_owned()));
}

#[test]
fn game_start_needs_a_clean_slug() {
    assert!(validate_browser(&incoming(r#"{"event":"game_start"}"#)).is_none());
    assert!(validate_browser(&incoming(r#"{"event":"game_start","game_slug":"A b"}"#)).is_none());
    assert!(validate_browser(&incoming(
        r#"{"event":"game_start","game_slug":"word-guess"}"#
    ))
    .is_some());
}

#[test]
fn behavioral_params_reject_wrong_values_and_missing_required_fields() {
    let cases = [
        (
            json!({"event":"game_complete","game_slug":"sudoku","mode":"daily","status":"won","time_bucket_s":0,"is_guest":false}),
            &[
                ("mode", json!("story")),
                ("status", json!("playing")),
                ("time_bucket_s", json!(29)),
                ("is_guest", Value::Null),
            ][..],
        ),
        (
            json!({"event":"game_abandon","game_slug":"sudoku","mode":"practice","progress_pct_bucket":75,"is_guest":true}),
            &[
                ("progress_pct_bucket", json!(100)),
                ("progress_pct_bucket", json!(76)),
            ][..],
        ),
        (
            json!({"event":"hint_used","game_slug":"sudoku","mode":"archive","hint_count":1}),
            &[("hint_count", json!(0)), ("hint_count", json!(101))][..],
        ),
        (
            json!({"event":"share_clicked","game_slug":"sudoku","action":"native_share","has_percentile":false}),
            &[
                ("action", json!("private-url")),
                ("has_percentile", Value::Null),
            ][..],
        ),
        (
            json!({"event":"paywall_hit","game_slug":"sudoku","surface":"4th_game_lock","picks_used":3,"currency":"USD","is_guest":false}),
            &[
                ("surface", json!("unknown_lock")),
                ("picks_used", json!(4)),
                ("currency", json!("usd")),
            ][..],
        ),
        (
            json!({"event":"pwa_install_prompted","platform":"other","trigger":"post_first_win"}),
            &[
                ("platform", json!("arbitrary-user-agent")),
                ("trigger", json!("settings")),
            ][..],
        ),
        (
            json!({"event":"pwa_installed","platform":"ios_guide","trigger":"post_first_win"}),
            &[("platform", json!("ios")), ("trigger", json!("post_win"))][..],
        ),
        (
            json!({"event":"push_opted_in","trigger":"post_win","result":"dismissed"}),
            &[
                ("trigger", json!("post_first_win")),
                ("result", json!("default")),
            ][..],
        ),
    ];
    for (valid, invalid_fields) in &cases {
        assert!(
            validate_browser(&incoming(&valid.to_string())).is_some(),
            "{valid}"
        );
        let fields = valid
            .as_object()
            .unwrap_or_else(|| panic!("not an event object: {valid}"));
        for field in fields.keys() {
            let mut missing = fields.clone();
            missing.remove(field);
            assert!(
                serde_json::from_value::<Incoming>(json!(missing))
                    .ok()
                    .and_then(|request| validate_browser(&request))
                    .is_none(),
                "accepted missing {field} in {valid}",
            );
        }
        for (field, value) in *invalid_fields {
            let mut invalid = valid.clone();
            invalid[*field] = value.clone();
            assert!(
                validate_browser(&incoming(&invalid.to_string())).is_none(),
                "{invalid}"
            );
        }
    }
    let mut completed = cases[0].0.clone();
    for (pick, accepted) in [(0, false), (1, true), (2, true), (3, true), (4, false)] {
        completed["pick_index"] = json!(pick);
        assert_eq!(
            validate_browser(&incoming(&completed.to_string())).is_some(),
            accepted,
            "{completed}"
        );
    }
}

#[test]
fn web_vitals_need_a_known_metric_and_a_finite_value() {
    let ok = r#"{"event":"web_vitals","metric":"LCP","value":1200.5,"rating":"good"}"#;
    assert_eq!(validate_browser(&incoming(ok)).unwrap().metric, Some("LCP"));
    assert!(validate_browser(&incoming(
        r#"{"event":"web_vitals","metric":"FOO","value":1}"#
    ))
    .is_none());
    assert!(validate_browser(&incoming(
        r#"{"event":"web_vitals","metric":"CLS","value":-1}"#
    ))
    .is_none());
}

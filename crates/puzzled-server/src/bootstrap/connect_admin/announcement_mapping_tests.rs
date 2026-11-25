use super::announcements::announcement_from_json;

#[test]
fn a_stored_row_maps_to_the_wire_message() {
    let a = announcement_from_json(&serde_json::json!({
        "id": "i", "title": "T", "body": "B", "type": "warning", "active": false,
        "dismissible": false, "startsAt": "2026-10-01T00:00:00+00:00",
        "endsAt": "", "createdAt": "c", "updatedAt": "u",
    }));
    assert_eq!(
        (
            a.id.as_str(),
            a.title.as_str(),
            a.body.as_str(),
            a.r#type.as_str()
        ),
        ("i", "T", "B", "warning")
    );
    assert!(!a.active && !a.dismissible);
    assert_eq!(a.starts_at, "2026-10-01T00:00:00+00:00");
    assert_eq!(a.ends_at, "");
}

#[test]
fn a_row_missing_fields_defaults_to_an_open_dismissible_info_notice() {
    let a = announcement_from_json(&serde_json::json!({}));
    assert_eq!(a.r#type, "info");
    assert!(a.active && a.dismissible);
}

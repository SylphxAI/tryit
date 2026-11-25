use connectrpc::ConnectError;

use super::family::{family_handle, new_invite_code, resolve_family_handle};

#[test]
fn invite_codes_are_ten_unambiguous_characters() {
    let code = new_invite_code();
    assert_eq!(code.len(), 10);
    assert!(code
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    assert!(!code.contains(['O', '0', 'I', '1']));
    assert_ne!(code, new_invite_code());
}

#[test]
fn family_references_are_scoped_and_actions_accept_only_owned_handles() -> Result<(), ConnectError>
{
    let rows = vec![("member-a".into(), Some("Player".into()), 0)];
    let handle = family_handle("test-key", "owner-a", "member-a")?;
    assert!(!handle.contains("member-a"));
    assert_eq!(
        resolve_family_handle("test-key", "owner-a", &handle, &rows)?,
        Some("member-a")
    );
    assert_eq!(
        resolve_family_handle("test-key", "owner-b", &handle, &rows)?,
        None
    );
    assert_eq!(
        resolve_family_handle("test-key", "owner-a", "member-a", &rows)?,
        None
    );
    assert_eq!(
        resolve_family_handle("test-key", "owner-a", "unknown", &rows)?,
        None
    );
    assert_eq!(
        resolve_family_handle("other-key", "owner-a", &handle, &rows)?,
        None
    );
    Ok(())
}

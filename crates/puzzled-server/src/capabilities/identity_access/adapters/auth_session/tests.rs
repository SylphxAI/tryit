use axum::http::header::{AUTHORIZATION, COOKIE};
use axum::http::HeaderMap;
use serde_json::{json, Value};

use super::super::platform_jwt::VerifiedIdentity;
use super::{
    auth_id_value, encode_identity, principal_from_session, session_token, verified_identity,
    AuthSessions, VERIFIED_IDENTITY_HEADER,
};

#[test]
fn runtime_auth_honors_the_bound_origin() {
    let auth = AuthSessions::from_settings(|name| match name {
        "SYLPHX_AUTH_URL" => Some(" https://bound-auth.example/// ".to_string()),
        "SYLPHX_AUTH_ORGANIZATION_ID" => Some(ORG.to_string()),
        "SYLPHX_PUBLISHABLE_KEY" => Some("pk-test".to_string()),
        _ => None,
    });
    assert_eq!(auth.auth_url, "https://bound-auth.example");
    assert_eq!(
        AuthSessions::from_settings(|_| None).auth_url,
        "https://api.identity.sylphx.com"
    );
}

const ORG: &str = "organization-0199aa10-7b2c-7d3e-8f00-00000000c0de";

#[test]
fn session_response_becomes_a_principal_and_inactive_users_do_not() {
    let body = json!({"session": {"principal": {
        "principal_id": "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab", "project_id": ORG,
        "display_name": "Ada", "primary_email": "ada@example.com", "state": "active"}}});
    let p = principal_from_session(&body, ORG).expect("principal");
    assert_eq!(p.subject, "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab");
    assert_eq!(p.legacy_subject, None);
    assert_eq!(p.email.as_deref(), Some("ada@example.com"));
    let revoked = json!({"session": {"principal": {
        "principal_id": "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab",
        "project_id": ORG, "state": "revoked"}}});
    assert!(principal_from_session(&revoked, ORG).is_none());
}

#[test]
fn only_sessions_of_our_own_auth_instance_count() {
    let from = |project: Value| {
        let mut principal = json!({"principal_id": "usr_a", "primary_email": "ada@example.com",
            "state": "active"});
        if !project.is_null() {
            principal["project_id"] = project;
        }
        json!({"session": {"principal": principal}})
    };
    // (a) Our own instance, in either case form.
    assert!(principal_from_session(&from(json!(ORG)), ORG).is_some());
    let camel = json!({"session": {"principal": {"principalId": "usr_a", "projectId": ORG}}});
    assert!(principal_from_session(&camel, ORG).is_some());
    // (b) Another tenant's instance, even with a matching email.
    assert!(principal_from_session(
        &from(json!("organization-0199aa10-7b2c-7d3e-8f00-00000000bad0")),
        ORG
    )
    .is_none());
    // (c) No or empty project id.
    assert!(principal_from_session(&from(Value::Null), ORG).is_none());
    assert!(principal_from_session(&from(json!("")), ORG).is_none());
    // (d) Our own id unset.
    assert!(principal_from_session(&from(json!(ORG)), "").is_none());
    assert!(principal_from_session(&from(json!("")), " ").is_none());
}

#[test]
fn the_new_subject_form_is_kept_verbatim_with_its_legacy_subject() {
    let body = json!({"session": {"principal": {
        "principal_id": "usr_01kmp4wyhhfgxsyrjvh8e0tkkf",
        "legacy_principal_id": "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab",
        "project_id": ORG, "state": "active"}}});
    let p = principal_from_session(&body, ORG).expect("principal");
    assert_eq!(p.subject, "usr_01kmp4wyhhfgxsyrjvh8e0tkkf");
    assert_eq!(
        p.legacy_subject.as_deref(),
        Some("principal-0199aa10-7b2c-7d3e-8f00-1234567890ab")
    );
    // A legacy value equal to the subject carries nothing.
    let same = json!({"principal": {"principalId": "usr_a", "sylphx_legacy_sub": "usr_a",
        "projectId": ORG}});
    assert_eq!(
        principal_from_session(&same, ORG).unwrap().legacy_subject,
        None
    );
}

#[test]
fn auth_ids_compare_by_value_across_forms() {
    // TypeID spec v0.3 vectors.
    assert_eq!(auth_id_value("org_00000000000000000000000000"), Some(0));
    assert_eq!(
        auth_id_value("org_01h455vb4pex5vsknk084sn02q"),
        Some(0x0189_0a5d_ac96_774b_bcce_b302_099a_8057)
    );
    assert_eq!(
        auth_id_value("organization-01890A5D-AC96-774B-BCCE-B302099A8057"),
        auth_id_value("org_01h455vb4pex5vsknk084sn02q")
    );
    // aorg_ test vector, both directions.
    assert_eq!(
        auth_id_value("organization-01890a5d-ac96-774b-bcce-b302099a8057"),
        auth_id_value("aorg_01h455vb4pex5vsknk084sn02q")
    );
    assert_eq!(
        auth_id_value("aorg_01h455vb4pex5vsknk084sn02q"),
        auth_id_value("organization-01890a5d-ac96-774b-bcce-b302099a8057")
    );
    assert_eq!(
        auth_id_value("01890a5d-ac96-774b-bcce-b302099a8057"),
        Some(0x0189_0a5d_ac96_774b_bcce_b302_099a_8057)
    );
    for malformed in [
        "",
        "org_puzzled",
        "org_81h455vb4pex5vsknk084sn02q", // first digit above 7
        "org_01h455vb4pex5vsknk084sn02",  // 25 digits
        "org_01h455vb4pex5vsknk084sn02u", // 'u' is not Crockford
        "org_01H455VB4PEX5VSKNK084SN02Q", // upper case
        "o_01h455vb4pex5vsknk084sn02q",   // prefix too short
        "organization_01h455vb4pex5vsknk084sn02q", // prefix too long
        "organization-01890a5dac96774bbcceb302099a8057", // not canonical
        "organization-01890a5d-ac96-774b-bcce-b302099a805g",
    ] {
        assert_eq!(auth_id_value(malformed), None, "{malformed}");
    }

    let session = |project: &str| json!({"session": {"principal": {"principal_id": "usr_a", "project_id": project}}});
    const LEGACY: &str = "organization-01890a5d-ac96-774b-bcce-b302099a8057";
    const TYPEID: &str = "org_01h455vb4pex5vsknk084sn02q";
    // Same uuid, either form on either side.
    assert!(principal_from_session(&session(TYPEID), LEGACY).is_some());
    assert!(principal_from_session(&session(LEGACY), TYPEID).is_some());
    // A different uuid, in either form.
    let other = "organization-01890a5d-ac96-774b-bcce-b302099a8058";
    assert!(principal_from_session(&session(other), TYPEID).is_none());
    assert!(principal_from_session(&session("org_01h455vb4pex5vsknk084sn02r"), LEGACY).is_none());
    // Malformed on either side.
    assert!(principal_from_session(&session("org_puzzled"), LEGACY).is_none());
    assert!(principal_from_session(&session(LEGACY), "org_puzzled").is_none());
}

#[test]
fn token_comes_from_bearer_or_cookie_only_when_it_is_an_auth_session() {
    let mut headers = HeaderMap::new();
    headers.insert(
        COOKIE,
        "a=1; puzzled_session=identity_org_session_abc"
            .parse()
            .unwrap(),
    );
    assert_eq!(
        session_token(&headers).as_deref(),
        Some("identity_org_session_abc")
    );
    headers.insert(
        AUTHORIZATION,
        "Bearer identity_org_session_xyz".parse().unwrap(),
    );
    assert_eq!(
        session_token(&headers).as_deref(),
        Some("identity_org_session_xyz")
    );
    let mut jwt = HeaderMap::new();
    jwt.insert(AUTHORIZATION, "Bearer eyJhbGciOi.x.y".parse().unwrap());
    assert_eq!(session_token(&jwt), None);
}

#[test]
fn old_cookie_name_still_signs_in_and_the_new_name_wins() {
    let mut headers = HeaderMap::new();
    headers.insert(
        COOKIE,
        "sylphx_identity_session=identity_org_session_old"
            .parse()
            .unwrap(),
    );
    assert_eq!(
        session_token(&headers).as_deref(),
        Some("identity_org_session_old")
    );
    headers.insert(
        COOKIE,
        "sylphx_identity_session=identity_org_session_old; puzzled_session=identity_org_session_new"
            .parse()
            .unwrap(),
    );
    assert_eq!(
        session_token(&headers).as_deref(),
        Some("identity_org_session_new")
    );
}

#[test]
fn delegation_fields_are_kept_wherever_auth_puts_them() {
    let principal = json!({"principal_id": "usr_a", "project_id": ORG, "state": "active"});
    let plain = json!({"session": {"principal": principal.clone()}});
    assert_eq!(principal_from_session(&plain, ORG).unwrap().actor, None);
    let on_session = json!({"session": {"principal": principal.clone(),
        "act": {"sub": "agent_1"}}});
    assert_eq!(
        principal_from_session(&on_session, ORG)
            .unwrap()
            .actor
            .as_deref(),
        Some("agent_1")
    );
    let on_body = json!({"actor": "agent_2", "session": {"principal": principal.clone()}});
    assert_eq!(
        principal_from_session(&on_body, ORG)
            .unwrap()
            .actor
            .as_deref(),
        Some("agent_2")
    );
    let mut on_principal = principal.clone();
    on_principal["actor"] = json!({"kind": "agent"});
    let body = json!({"session": {"principal": on_principal}});
    assert_eq!(
        principal_from_session(&body, ORG).unwrap().actor.as_deref(),
        Some("delegated")
    );
    // Presence alone is delegation, whatever the value.
    for value in [json!(null), json!(false), json!(""), json!({})] {
        for key in ["act", "actor"] {
            let mut session = json!({"principal": principal.clone()});
            session[key] = value.clone();
            let body = json!({ "session": session });
            assert_eq!(
                principal_from_session(&body, ORG).unwrap().actor.as_deref(),
                Some("delegated"),
                "{key}={value}"
            );
        }
    }
}

#[test]
fn header_round_trips() {
    let id = VerifiedIdentity {
        user_id: "0199aa10-7b2c-7d3e-8f00-1234567890ab".into(),
        display_name: Some("Ada".into()),
        email: None,
        actor: Some("agent_1".into()),
    };
    let mut headers = HeaderMap::new();
    headers.insert(VERIFIED_IDENTITY_HEADER, encode_identity(&id).unwrap());
    assert_eq!(verified_identity(&headers), Some(id));
}

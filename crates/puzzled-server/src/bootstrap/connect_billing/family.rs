use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use sqlx::PgPool;

use super::{account, internal, BillingConnectService};
use crate::capabilities::billing::adapters::billing_db::{self, JoinRefused};
use crate::capabilities::money::access as money_access;
use crate::proto::puzzled::v1::{
    Family, FamilyMember, JoinFamilyRequest, JoinFamilyResponse, LeaveFamilyResponse,
    RemoveFamilyMemberRequest, RemoveFamilyMemberResponse, ResetFamilyInviteResponse,
};

pub(super) async fn join_family(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, JoinFamilyRequest>,
) -> ServiceResult<JoinFamilyResponse> {
    let identity = account(&ctx)?;
    let pool = billing.pool()?;
    let code = request
        .to_owned_message()
        .invite_code
        .trim()
        .to_ascii_uppercase();
    let not_found = || ConnectError::new(ErrorCode::NotFound, "invite_not_found");
    if code.is_empty() || code.len() > 32 {
        return Err(not_found());
    }
    let owner = billing_db::family_owner_by_code(pool, &code)
        .await
        .map_err(internal("family_unavailable"))?
        .ok_or_else(not_found)?;
    if owner == identity.user_id {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "family_owner",
        ));
    }
    if !family_active(billing, &owner).await {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "family_plan_inactive",
        ));
    }
    match billing_db::join_family(
        pool,
        &owner,
        &identity.user_id,
        max_members(billing, &owner).await?,
    )
    .await
    .map_err(internal("family_unavailable"))?
    {
        Ok(()) => Response::ok(JoinFamilyResponse::default()),
        Err(JoinRefused::Full) => Err(ConnectError::new(
            ErrorCode::ResourceExhausted,
            "family_full",
        )),
        Err(JoinRefused::AlreadyInFamily) => Err(ConnectError::new(
            ErrorCode::AlreadyExists,
            "already_in_family",
        )),
    }
}

pub(super) async fn leave_family(
    billing: &BillingConnectService,
    ctx: RequestContext,
) -> ServiceResult<LeaveFamilyResponse> {
    let identity = account(&ctx)?;
    let pool = billing.pool()?;
    billing_db::remove_family_member(pool, None, &identity.user_id)
        .await
        .map_err(internal("family_unavailable"))?;
    Response::ok(LeaveFamilyResponse::default())
}

pub(super) async fn remove_family_member(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, RemoveFamilyMemberRequest>,
) -> ServiceResult<RemoveFamilyMemberResponse> {
    let identity = account(&ctx)?;
    let pool = billing.pool()?;
    let handle = request.to_owned_message().user_id;
    let handle_key = family_handle_key()?;
    let members = billing_db::family_members(pool, &identity.user_id)
        .await
        .map_err(internal("family_unavailable"))?;
    let member = resolve_family_handle(&handle_key, &identity.user_id, &handle, &members)?
        .ok_or_else(|| ConnectError::new(ErrorCode::NotFound, "member_not_found"))?;
    if billing_db::remove_family_member(pool, Some(&identity.user_id), member)
        .await
        .map_err(internal("family_unavailable"))?
    {
        Response::ok(RemoveFamilyMemberResponse::default())
    } else {
        Err(ConnectError::new(ErrorCode::NotFound, "member_not_found"))
    }
}

pub(super) async fn reset_family_invite(
    billing: &BillingConnectService,
    ctx: RequestContext,
) -> ServiceResult<ResetFamilyInviteResponse> {
    let identity = account(&ctx)?;
    let pool = billing.pool()?;
    if !family_active(billing, &identity.user_id).await {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "family_plan_inactive",
        ));
    }
    let code = new_invite_code()?;
    billing_db::set_family_invite_code(pool, &identity.user_id, &code)
        .await
        .map_err(internal("family_unavailable"))?;
    Response::ok(ResetFamilyInviteResponse {
        invite_code: code,
        ..Default::default()
    })
}

pub(super) async fn family_view(
    billing: &BillingConnectService,
    pool: &PgPool,
    owner: &str,
    viewer_is_owner: bool,
) -> Result<Family, ConnectError> {
    let mut invite_code = billing_db::family_invite_code(pool, owner)
        .await
        .map_err(internal("family_unavailable"))?;
    if viewer_is_owner && invite_code.is_none() {
        let code = new_invite_code()?;
        billing_db::set_family_invite_code(pool, owner, &code)
            .await
            .map_err(internal("family_unavailable"))?;
        invite_code = Some(code);
    }
    let owner_name = billing_db::display_name(pool, owner)
        .await
        .map_err(internal("family_unavailable"))?;
    let handle_key = family_handle_key()?;
    let mut members = vec![FamilyMember {
        user_id: family_handle(&handle_key, owner, owner)?,
        display_name: owner_name.unwrap_or_default(),
        owner: true,
        ..Default::default()
    }];
    for (user_id, name, joined_at_ms) in billing_db::family_members(pool, owner)
        .await
        .map_err(internal("family_unavailable"))?
    {
        members.push(FamilyMember {
            user_id: family_handle(&handle_key, owner, &user_id)?,
            display_name: name.unwrap_or_default(),
            owner: false,
            joined_at_ms,
            ..Default::default()
        });
    }
    Ok(Family {
        role: if viewer_is_owner { "owner" } else { "member" }.to_string(),
        members,
        // Shown only; 0 while Money cannot say.
        max_members: max_members(billing, owner).await.unwrap_or(0),
        invite_code: if viewer_is_owner { invite_code } else { None },
        ..Default::default()
    })
}

/// Does `owner` hold a family plan now, in Money?
async fn family_active(billing: &BillingConnectService, owner: &str) -> bool {
    let Some(money) = &billing.state.money else {
        return false;
    };
    for subj in billing.player_subjects(owner).await {
        if money_access::family_active(money, &subj).await {
            return true;
        }
    }
    false
}

/// Seats on `owner`'s plan, from Money's `seats` limit. `Err`: Money could
/// not answer (or the owner holds no `seats` limit), so nothing is decided
/// from a guess.
async fn max_members(billing: &BillingConnectService, owner: &str) -> Result<u32, ConnectError> {
    let unavailable = || ConnectError::new(ErrorCode::Unavailable, "seats_unavailable");
    let money = billing.state.money.as_ref().ok_or_else(unavailable)?;
    for subj in billing.player_subjects(owner).await {
        if let Some(seats) = money_access::seats(money, &subj).await.ok().flatten() {
            return Ok(seats);
        }
    }
    Err(unavailable())
}

// Family references are scoped to one owner and never contain an account id.
pub(super) fn family_handle(
    secret: &str,
    owner: &str,
    member: &str,
) -> Result<String, ConnectError> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "family_unavailable"))?;
    mac.update(b"puzzled:family-member:v1\0");
    mac.update(owner.as_bytes());
    mac.update(b"\0");
    mac.update(member.as_bytes());
    let tag = mac.finalize().into_bytes();
    Ok(format!(
        "fm_{}",
        tag.iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ))
}

fn family_handle_key() -> Result<String, ConnectError> {
    // Existing product-scoped key; domain separation prevents token reuse.
    std::env::var("EMAIL_UNSUBSCRIBE_SECRET")
        .ok()
        .filter(|key| !key.is_empty())
        .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "family_unavailable"))
}

pub(super) fn resolve_family_handle<'a>(
    secret: &str,
    owner: &str,
    handle: &str,
    members: &'a [(String, Option<String>, i64)],
) -> Result<Option<&'a str>, ConnectError> {
    for (member, _, _) in members {
        if family_handle(secret, owner, member)? == handle {
            return Ok(Some(member.as_str()));
        }
    }
    Ok(None)
}

/// A fresh 10-character bearer code with no look-alike characters.
pub(super) fn new_invite_code() -> Result<String, ConnectError> {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut bytes = [0_u8; 10];
    getrandom::fill(&mut bytes)
        .map_err(|error| internal("family_unavailable")(error.to_string()))?;
    // Each of the 32 symbols has exactly eight byte values: five random bits.
    Ok(bytes
        .into_iter()
        .map(|b| ALPHABET[usize::from(b) % ALPHABET.len()] as char)
        .collect())
}

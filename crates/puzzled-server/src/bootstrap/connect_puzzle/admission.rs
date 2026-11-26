use chrono::{NaiveDate, Utc};
use connectrpc::{ConnectError, ErrorCode, RequestContext};
use tracing::warn;

use puzzled_core::billing_access::policy::play_access;
use puzzled_core::identity_policy::guest_day_id::user_id_to_storage_uuid;
use puzzled_core::puzzle_play::daily_time::product_day_key;

use super::{PuzzleConnectService, TRACE_TARGET};
use crate::bootstrap::identity::RequestAccess;
use crate::capabilities::billing::service::access as entitlement_access;
use crate::capabilities::puzzle_play::adapters::daily_free_picks::{self, Picks};

/// How a request for a puzzle was admitted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Admission {
    /// Open without spending a pick: Plus, sales closed, Money unanswerable,
    /// or a game already picked today.
    Open,
    /// Today's game on a free pick not yet taken; active play claims it.
    FreePick,
}

impl PuzzleConnectService {
    /// Admit a request for a puzzle (the Tryit Plus gate, the one admission
    /// point).
    ///
    /// A future day is refused so no one can read tomorrow's solution early.
    /// Today, any game the player has picked, or could still pick, is free to
    /// everyone, guests included, and that is decided without any billing
    /// read. A further game and every past day need Tryit Plus once it is on
    /// sale. While Money is not configured nothing is sold, so nothing is
    /// locked. An entitlement read that fails refuses paid play only.
    pub(super) async fn enforce_play_access(
        &self,
        ctx: &RequestContext,
        user_id: Option<&str>,
        game_slug: &str,
        date: NaiveDate,
    ) -> Result<Admission, ConnectError> {
        let today = product_day_key(Utc::now());
        if date > today {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "future_puzzle_date",
            ));
        }
        let is_today = date == today;
        if is_today {
            match self.read_picks(ctx, user_id, game_slug, today).await {
                Ok(picks) => return self.admit_today_from_picks(user_id, picks).await,
                Err(error) => {
                    // Keep the free floor open: the claim on write, under the
                    // player's lock, is the authority.
                    warn!(target: TRACE_TARGET, %error, "free pick read failed; the write claim decides");
                    return Ok(Admission::FreePick);
                }
            }
        }
        self.paid_access(user_id, is_today)
            .await
            .map(|()| Admission::Open)
    }

    pub(super) async fn admit_today_from_picks(
        &self,
        user_id: Option<&str>,
        picks: Picks,
    ) -> Result<Admission, ConnectError> {
        if picks.chosen {
            Ok(Admission::Open)
        } else if picks.open() {
            Ok(Admission::FreePick)
        } else {
            self.paid_access(user_id, true)
                .await
                .map(|()| Admission::Open)
        }
    }

    /// Today's picks for the request's players: the account and any guest
    /// cookie it has not adopted yet count as one set.
    async fn read_picks(
        &self,
        ctx: &RequestContext,
        user_id: Option<&str>,
        game_slug: &str,
        today: NaiveDate,
    ) -> Result<Picks, sqlx::Error> {
        let Some(pool) = &self.state.pool else {
            return Ok(Picks::default());
        };
        let player = user_id.and_then(user_id_to_storage_uuid);
        let players = player.as_slice();
        let hash = crate::bootstrap::identity::guest_credential_hash(ctx);
        daily_free_picks::read_for_request(pool, players, hash, today, game_slug).await
    }

    /// Take the pick a write was admitted on, inside the request's locked
    /// transaction. When the last pick went meanwhile (another tab), the game
    /// is open only through Tryit Plus.
    pub(super) async fn claim_free_pick(
        &self,
        access: &mut RequestAccess,
        user_id: Option<&str>,
        game_slug: &str,
        today: NaiveDate,
    ) -> Result<(), ConnectError> {
        let player = access
            .primary()
            .and_then(|identity| user_id_to_storage_uuid(&identity.user_id));
        if self.state.pool.is_none() {
            return Ok(());
        }
        let (Some(player), Some(connection)) = (player, access.connection()) else {
            return Err(ConnectError::new(
                ErrorCode::Internal,
                "free_pick_claim_failed",
            ));
        };
        match daily_free_picks::claim(connection, player, today, game_slug).await {
            Ok(true) => Ok(()),
            Ok(false) => self.paid_access(user_id, true).await,
            Err(error) => {
                warn!(target: TRACE_TARGET, %error, "free pick claim failed");
                Err(ConnectError::new(
                    ErrorCode::Internal,
                    "free_pick_claim_failed",
                ))
            }
        }
    }

    /// The paid part of the gate: sales, the Plus entitlement, and the Money
    /// outage policy.
    async fn paid_access(&self, user_id: Option<&str>, is_today: bool) -> Result<(), ConnectError> {
        let sales_open = self.state.sales_open().await;
        if !sales_open {
            return Ok(());
        }
        let entitled = match (user_id, &self.state.pool) {
            (Some(uid), Some(pool)) => {
                match entitlement_access(pool, self.state.money.as_ref(), uid).await {
                    Ok(found) => found.entitled,
                    Err(error) => {
                        warn!(target: TRACE_TARGET, %error, "entitlement read failed; refusing paid play");
                        false
                    }
                }
            }
            _ => false,
        };
        // Money unreachable: it cannot vouch for anyone, so nothing that is
        // open today is locked behind it.
        if !entitled {
            if let (Some(uid), Some(money)) = (user_id, self.state.money.as_ref()) {
                if money
                    .try_check(uid, crate::capabilities::money::access::FEATURE_PLUS)
                    .await
                    .is_err()
                {
                    // Intended: player experience over a small leak while Money
                    // is down. Counted so an outage-long free ride is visible.
                    tracing::warn!(
                        target: TRACE_TARGET,
                        event = "money_entitlement_unanswerable_allowed",
                        feature = crate::capabilities::money::access::FEATURE_PLUS,
                        "Money could not answer the Plus check; play allowed"
                    );
                    return Ok(());
                }
            }
        }
        play_access(sales_open, entitled, is_today, false)
            .map_err(|denied| ConnectError::new(ErrorCode::PermissionDenied, denied.code()))
    }
}

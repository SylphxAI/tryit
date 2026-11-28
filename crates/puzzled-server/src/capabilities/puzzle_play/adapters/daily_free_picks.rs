//! The games each player chose to play free on a product day.
//!
//! Serving a board only reads the picks; the first graded write (a checked
//! guess or a submitted finish) claims one, under the player's lock, so a
//! glance at a game page never spends a pick.
use chrono::NaiveDate;
use puzzled_core::billing_access::policy::{free_pick_open, DAILY_FREE_PICKS};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

/// Today's picks across the given players (an account and the guest it is
/// about to adopt count as one set).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Picks {
    /// This game is already one of the picks.
    pub chosen: bool,
    /// Distinct games picked.
    pub count: u32,
}

impl Picks {
    /// The game may be played free: chosen already, or a pick is left.
    #[must_use]
    pub fn open(self) -> bool {
        free_pick_open(self.chosen, self.count)
    }
}

pub async fn read<'e, E>(
    executor: E,
    players: &[Uuid],
    day: NaiveDate,
    slug: &str,
) -> Result<Picks, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    if players.is_empty() {
        return Ok(Picks::default());
    }
    read_for_request(executor, players, None, day, slug).await
}

/// Read the account/guest union in one snapshot and one checked checkout.
pub async fn read_for_request<'e, E>(
    executor: E,
    players: &[Uuid],
    guest_hash: Option<&str>,
    day: NaiveDate,
    slug: &str,
) -> Result<Picks, sqlx::Error>
where
    E: sqlx::PgExecutor<'e>,
{
    if players.is_empty() && guest_hash.is_none() {
        return Ok(Picks::default());
    }
    let row = sqlx::query(
        "SELECT count(DISTINCT game_slug) AS count, coalesce(bool_or(game_slug = $3), false) AS chosen          FROM daily_free_picks WHERE day_key = $2 AND (user_id = ANY($1) OR user_id = (             SELECT user_id FROM guest_credentials WHERE token_hash = $4 AND adopted_user_id IS NULL AND revoked_at IS NULL         ))",
    )
    .bind(players)
    .bind(day)
    .bind(slug)
    .bind(guest_hash)
    .fetch_one(executor)
    .await?;
    Ok(Picks {
        chosen: row.try_get("chosen")?,
        count: u32::try_from(row.try_get::<i64, _>("count")?).unwrap_or(u32::MAX),
    })
}

/// Read the exact picks for the already-admitted player, oldest first.
/// The caller uses its identity transaction, after any guest adoption.
pub async fn list_for_player(
    connection: &mut PgConnection,
    player: Uuid,
    day: NaiveDate,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT game_slug FROM daily_free_picks WHERE user_id = $1 AND day_key = $2 ORDER BY started_at, game_slug",
    )
    .bind(player)
    .bind(day)
    .fetch_all(connection)
    .await
}

/// Take the game as one of the player's picks; false when none is left.
///
/// How a pick was claimed: an explicit start or the first graded write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Via {
    Start,
    Guess,
    Finish,
}

/// Point-in-time provenance stored with a new pick only. A pick claimed
/// before collection keeps NULLs (not collected), never an inferred value.
/// Guest entry is whether the claiming player is a guest credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Claim {
    pub via: Via,
    /// The request carried the verification header (as a finish would).
    pub comparison: bool,
}

/// The caller holds the player's lock through commit (the same lock admission,
/// adoption and erasure take), so two tabs cannot both take the last pick.
pub async fn claim(
    connection: &mut PgConnection,
    player: Uuid,
    day: NaiveDate,
    slug: &str,
    how: Claim,
) -> Result<bool, sqlx::Error> {
    let via = match how.via {
        Via::Start => "start",
        Via::Guess => "guess",
        Via::Finish => "finish",
    };
    sqlx::query_scalar(
        "WITH picks AS (           SELECT count(*) AS count, coalesce(bool_or(game_slug = $3), false) AS chosen            FROM daily_free_picks WHERE user_id = $1 AND day_key = $2         ), claimed AS (           INSERT INTO daily_free_picks (user_id, day_key, game_slug, claimed_via, guest_entry, comparison_excluded)            SELECT $1, $2, $3, $5, EXISTS (SELECT 1 FROM guest_credentials WHERE user_id = $1), $6 FROM picks WHERE NOT chosen AND count < $4            ON CONFLICT DO NOTHING RETURNING 1         )          SELECT chosen OR count < $4 FROM picks",
    )
    .bind(player)
    .bind(day)
    .bind(slug)
    .bind(i64::from(DAILY_FREE_PICKS))
    .bind(via)
    .bind(how.comparison)
    .fetch_one(connection)
    .await
}

/// Merge the guest's picks into the account: a set union, so neither side
/// loses a game it already opened (the union may exceed the daily limit).
/// Both player locks are held by the outer adoption transaction.
pub async fn adopt(
    connection: &mut PgConnection,
    account: Uuid,
    guest: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        // On a collision the earlier start and its provenance win, so a guest's
        // first game survives adoption into an account that opened it later.
        "INSERT INTO daily_free_picks (user_id, day_key, game_slug, started_at, claimed_via, guest_entry, comparison_excluded) \
         SELECT $1, day_key, game_slug, started_at, claimed_via, guest_entry, comparison_excluded FROM daily_free_picks WHERE user_id = $2 \
         ON CONFLICT (user_id, day_key, game_slug) DO UPDATE SET started_at = excluded.started_at, claimed_via = excluded.claimed_via, \
         guest_entry = excluded.guest_entry, comparison_excluded = excluded.comparison_excluded \
         WHERE excluded.started_at < daily_free_picks.started_at",
    )
    .bind(account)
    .bind(guest)
    .execute(&mut *connection)
    .await?;
    sqlx::query("DELETE FROM daily_free_picks WHERE user_id = $1")
        .bind(guest)
        .execute(connection)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::fresh_database;

    const START: Claim = Claim {
        via: Via::Start,
        comparison: false,
    };

    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 18).unwrap()
    }

    #[tokio::test]
    async fn three_games_are_taken_a_fourth_is_refused_and_a_repeat_stays_open() {
        let Some(pool) = fresh_database().await else {
            return;
        };
        let player = Uuid::now_v7();
        let mut connection = pool.acquire().await.unwrap();
        for slug in ["sudoku", "crossword", "word-guess"] {
            assert!(claim(&mut connection, player, day(), slug, START)
                .await
                .unwrap());
        }
        assert!(!claim(&mut connection, player, day(), "nonogram", START)
            .await
            .unwrap());
        assert!(claim(&mut connection, player, day(), "sudoku", START)
            .await
            .unwrap());
        let picks = read(&pool, &[player], day(), "nonogram").await.unwrap();
        assert_eq!(
            picks,
            Picks {
                chosen: false,
                count: 3
            }
        );
        assert!(!picks.open());
        // A new day starts with every pick free again.
        let tomorrow = day().succ_opt().unwrap();
        assert!(claim(&mut connection, player, tomorrow, "nonogram", START)
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn sign_in_merges_the_guest_picks_without_losing_either_side() {
        let Some(pool) = fresh_database().await else {
            return;
        };
        let (account, guest) = (Uuid::now_v7(), Uuid::now_v7());
        let mut connection = pool.acquire().await.unwrap();
        for slug in ["sudoku", "crossword"] {
            assert!(claim(&mut connection, account, day(), slug, START)
                .await
                .unwrap());
        }
        for slug in ["crossword", "word-guess", "nonogram"] {
            assert!(claim(&mut connection, guest, day(), slug, START)
                .await
                .unwrap());
        }
        // Before adoption the two players already count as one set.
        let both = read(&pool, &[account, guest], day(), "crowns")
            .await
            .unwrap();
        assert_eq!(both.count, 4);
        adopt(&mut connection, account, guest).await.unwrap();
        let merged = read(&pool, &[account], day(), "nonogram").await.unwrap();
        assert_eq!(
            merged,
            Picks {
                chosen: true,
                count: 4
            }
        );
        assert_eq!(
            read(&pool, &[guest], day(), "sudoku").await.unwrap().count,
            0
        );
        // Every merged game stays open; no new one is.
        assert!(claim(&mut connection, account, day(), "word-guess", START)
            .await
            .unwrap());
        assert!(!claim(&mut connection, account, day(), "crowns", START)
            .await
            .unwrap());
    }

    #[tokio::test]
    #[rustfmt::skip]
    async fn provenance_is_written_once_with_a_new_pick_and_the_earlier_start_survives_adoption() {
        let Some(pool) = fresh_database().await else { return };
        let (account, guest, legacy) = (Uuid::now_v7(), Uuid::now_v7(), Uuid::now_v7());
        sqlx::query("INSERT INTO guest_credentials (token_hash,user_id,provenance) VALUES ('h-pick',$1,'server_issued')")
            .bind(guest).execute(&pool).await.unwrap();
        let row = |user: Uuid, slug: &'static str| {
            let pool = pool.clone();
            async move {
                sqlx::query_as::<_, (Option<String>, Option<bool>, Option<bool>)>("SELECT claimed_via,guest_entry,comparison_excluded FROM daily_free_picks WHERE user_id=$1 AND day_key=$2 AND game_slug=$3")
                    .bind(user).bind(day()).bind(slug).fetch_optional(&pool).await.unwrap()
            }
        };
        let some = |via: &str, guest: bool, cmp: bool| Some((Some(via.to_string()), Some(guest), Some(cmp)));
        let mut c = pool.acquire().await.unwrap();
        let guess = Claim { via: Via::Guess, comparison: false };
        let verify = Claim { via: Via::Finish, comparison: true };
        // A pick claimed before collection stays not collected; a retry or a
        // second tab never rewrites the first claim's provenance.
        sqlx::query("INSERT INTO daily_free_picks (user_id,day_key,game_slug) VALUES ($1,$2,'sudoku')").bind(legacy).bind(day()).execute(&pool).await.unwrap();
        assert!(claim(&mut c, legacy, day(), "sudoku", guess).await.unwrap());
        assert_eq!(row(legacy, "sudoku").await, Some((None, None, None)));
        assert!(claim(&mut c, guest, day(), "crossword", START).await.unwrap());
        assert!(claim(&mut c, guest, day(), "crossword", guess).await.unwrap());
        assert_eq!(row(guest, "crossword").await, some("start", true, false));
        assert!(claim(&mut c, guest, day(), "nonogram", verify).await.unwrap());
        assert_eq!(row(guest, "nonogram").await, some("finish", true, true));
        // A refused fourth claim and a rolled-back claim leave no row.
        assert!(claim(&mut c, guest, day(), "sudoku", START).await.unwrap());
        assert!(!claim(&mut c, guest, day(), "crowns", START).await.unwrap());
        let mut tx = pool.begin().await.unwrap();
        assert!(claim(&mut tx, account, day(), "word-guess", START).await.unwrap());
        tx.rollback().await.unwrap();
        assert_eq!(row(account, "word-guess").await, None);
        // Collision: the guest started crossword first, the account later.
        assert!(claim(&mut c, account, day(), "crossword", guess).await.unwrap());
        assert_eq!(row(account, "crossword").await, some("guess", false, false));
        assert!(claim(&mut c, account, day(), "word-guess", START).await.unwrap());
        sqlx::query("UPDATE daily_free_picks SET started_at = started_at - interval '1 hour' WHERE user_id=$1 AND game_slug='word-guess'").bind(account).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO daily_free_picks (user_id,day_key,game_slug,claimed_via,guest_entry,comparison_excluded) VALUES ($1,$2,'word-guess','guess',true,false)").bind(guest).bind(day()).execute(&pool).await.unwrap();
        adopt(&mut c, account, guest).await.unwrap();
        assert_eq!(row(account, "crossword").await, some("start", true, false));
        assert_eq!(row(account, "word-guess").await, some("start", false, false));
        assert_eq!(row(account, "nonogram").await, some("finish", true, true));
        assert_eq!(row(guest, "crossword").await, None);
    }
}

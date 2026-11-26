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
/// The caller holds the player's lock through commit (the same lock admission,
/// adoption and erasure take), so two tabs cannot both take the last pick.
pub async fn claim(
    connection: &mut PgConnection,
    player: Uuid,
    day: NaiveDate,
    slug: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "WITH picks AS (           SELECT count(*) AS count, coalesce(bool_or(game_slug = $3), false) AS chosen            FROM daily_free_picks WHERE user_id = $1 AND day_key = $2         ), claimed AS (           INSERT INTO daily_free_picks (user_id, day_key, game_slug)            SELECT $1, $2, $3 FROM picks WHERE NOT chosen AND count < $4            ON CONFLICT DO NOTHING RETURNING 1         )          SELECT chosen OR count < $4 FROM picks",
    )
    .bind(player)
    .bind(day)
    .bind(slug)
    .bind(i64::from(DAILY_FREE_PICKS))
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
        "INSERT INTO daily_free_picks (user_id, day_key, game_slug, started_at) SELECT $1, day_key, game_slug, started_at FROM daily_free_picks WHERE user_id = $2 ON CONFLICT DO NOTHING",
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
            assert!(claim(&mut connection, player, day(), slug).await.unwrap());
        }
        assert!(!claim(&mut connection, player, day(), "nonogram")
            .await
            .unwrap());
        assert!(claim(&mut connection, player, day(), "sudoku")
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
        assert!(claim(&mut connection, player, tomorrow, "nonogram")
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
            assert!(claim(&mut connection, account, day(), slug).await.unwrap());
        }
        for slug in ["crossword", "word-guess", "nonogram"] {
            assert!(claim(&mut connection, guest, day(), slug).await.unwrap());
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
        assert!(claim(&mut connection, account, day(), "word-guess")
            .await
            .unwrap());
        assert!(!claim(&mut connection, account, day(), "crowns")
            .await
            .unwrap());
    }
}

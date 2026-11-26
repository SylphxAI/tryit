use chrono::{Days, NaiveDate};

/// Unparseable ritual `day_key` - fail closed, do not skip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidDayKey(pub String);

/// Parse a product day key (`YYYY-MM-DD`). Empty or malformed keys are errors.
pub fn parse_day_key(raw: &str) -> Result<NaiveDate, InvalidDayKey> {
    let trimmed = raw.trim();
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d").map_err(|_| InvalidDayKey(trimmed.to_string()))
}

/// Parse accepted ritual day keys. One bad key fails the whole payload.
pub fn parse_accepted_day_keys<I, S>(raw: I) -> Result<Vec<NaiveDate>, InvalidDayKey>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    raw.into_iter()
        .map(|value| parse_day_key(value.as_ref()))
        .collect()
}

pub(super) fn sorted_unique(days: &[NaiveDate]) -> Vec<NaiveDate> {
    let mut unique = days.to_vec();
    unique.sort_unstable();
    unique.dedup();
    unique
}

pub(super) fn union(played: &[NaiveDate], frozen: &[NaiveDate]) -> Vec<NaiveDate> {
    let mut all = played.to_vec();
    all.extend_from_slice(frozen);
    sorted_unique(&all)
}

pub(super) fn previous(day: NaiveDate) -> Option<NaiveDate> {
    day.checked_sub_days(Days::new(1))
}

/// Cell value: sun, moon, or empty.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CellValue {
    Sun,
    Moon,
    Empty,
}

impl CellValue {
    #[must_use]
    pub fn is_filled(self) -> bool {
        matches!(self, Self::Sun | Self::Moon)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmissionStatus {
    Won,
    Lost,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GameResult {
    Invalid {
        error: String,
    },
    Valid {
        status: SubmissionStatus,
        score: u32,
    },
}

impl GameResult {
    #[must_use]
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid { .. })
    }
}

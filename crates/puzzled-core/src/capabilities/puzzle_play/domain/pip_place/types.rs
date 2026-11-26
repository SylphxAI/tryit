/// Grid cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cell {
    pub row: i32,
    pub col: i32,
}

/// Placed domino: cells `a`/`b` hold pips `pa`/`pb`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tile {
    pub a: Cell,
    pub b: Cell,
    pub pa: i32,
    pub pb: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegionKind {
    Sum,
    Equal,
    Unequal,
    Free,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Region {
    pub id: i32,
    pub kind: RegionKind,
    pub value: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Puzzle {
    pub max_pip: i32,
    pub rows: i32,
    pub cols: i32,
    pub region_of: Vec<Vec<i32>>,
    pub regions: Vec<Region>,
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

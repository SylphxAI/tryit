use std::collections::HashSet;

use crate::capabilities::puzzle_play::domain::random::{shuffle_array, SeededRandom};

use super::{
    tiling::{pip_at, Tile},
    Cell,
};

#[derive(Debug, Clone)]
pub(super) struct Region {
    pub(super) id: usize,
    pub(super) kind: &'static str,
    pub(super) value: Option<i64>,
}

fn region_pips(region_of: &[Vec<usize>], tiles: &[Tile], id: usize) -> Vec<i64> {
    let mut pips = Vec::new();
    for (row, line) in region_of.iter().enumerate() {
        for (col, region) in line.iter().enumerate() {
            if *region != id {
                continue;
            }
            if let Some(pip) = pip_at(tiles, Cell { row, col }) {
                pips.push(pip);
            }
        }
    }
    pips
}

struct RegionStat {
    id: usize,
    pips: Vec<i64>,
    sum: i64,
    can_equal: bool,
    can_unequal: bool,
}

pub(super) fn assign_constraints(
    region_of: &[Vec<usize>],
    tiles: &[Tile],
    random: &mut SeededRandom,
) -> Vec<Region> {
    let mut ordered: Vec<usize> = region_of
        .iter()
        .flatten()
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    ordered.sort_unstable();
    let stats: Vec<RegionStat> = ordered
        .iter()
        .map(|&id| {
            let pips = region_pips(region_of, tiles, id);
            let sum = pips.iter().sum();
            let can_equal = !pips.is_empty() && pips.iter().all(|pip| *pip == pips[0]);
            let can_unequal =
                !pips.is_empty() && pips.iter().collect::<HashSet<_>>().len() == pips.len();
            RegionStat {
                id,
                pips,
                sum,
                can_equal,
                can_unequal,
            }
        })
        .collect();

    let mut assigned: Vec<Region> = stats
        .iter()
        .map(|stat| Region {
            id: stat.id,
            kind: "sum",
            value: Some(stat.sum),
        })
        .collect();

    let equal_candidates: Vec<(usize, bool)> = shuffle_array(
        &stats
            .iter()
            .enumerate()
            .map(|(index, stat)| (index, stat.can_equal))
            .collect::<Vec<_>>(),
        random,
    )
    .into_iter()
    .filter(|(_, ok)| *ok)
    .collect();
    if let Some(&(idx, _)) = equal_candidates.first() {
        let first = stats[idx].pips.first().copied().unwrap_or(0);
        assigned[idx] = Region {
            id: stats[idx].id,
            kind: "equal",
            value: Some(first),
        };
    }

    let unequal_candidates: Vec<(usize, bool)> = shuffle_array(
        &stats
            .iter()
            .enumerate()
            .map(|(index, stat)| (index, stat.can_unequal && assigned[index].kind != "equal"))
            .collect::<Vec<_>>(),
        random,
    )
    .into_iter()
    .filter(|(_, ok)| *ok)
    .collect();
    if let Some(&(idx, _)) = unequal_candidates.first() {
        assigned[idx] = Region {
            id: stats[idx].id,
            kind: "unequal",
            value: None,
        };
    }

    let mut non_free = assigned.len();
    for region in &mut assigned {
        if non_free <= 3 {
            break;
        }
        if random.next_f64() >= 0.12 {
            continue;
        }
        *region = Region {
            id: region.id,
            kind: "free",
            value: None,
        };
        non_free -= 1;
    }

    if non_free < 3 {
        for (i, region) in assigned.iter_mut().enumerate() {
            if non_free >= 3 {
                break;
            }
            if region.kind != "free" {
                continue;
            }
            *region = Region {
                id: stats[i].id,
                kind: "sum",
                value: Some(stats[i].sum),
            };
            non_free += 1;
        }
    }
    assigned
}

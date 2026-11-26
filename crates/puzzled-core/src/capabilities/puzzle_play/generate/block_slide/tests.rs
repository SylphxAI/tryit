use super::generation::generate_counted;

/// Board layouts of the biggest block mix the generator can make (one
/// 1x2, one 2x1 and six 1x1 blocks around the target, two cells empty).
/// A solve that keys states by layout can never visit more.
const MOST_LAYOUTS: usize = 964_656;

/// Product days whose puzzle made one solve hold 140-496 MiB when every
/// ordering of same-sized blocks was its own state; that OOM-killed the
/// 256 MiB api during the daily puzzle fill. Seed: `YYYYMMDD` + 0/1/2.
const HEAVY_DAYS: [(i64, &str); 6] = [
    (20_260_919, "hard"), // 2026-09-17: 496 MiB, 21 s
    (20_260_915, "hard"), // 2026-09-13: 248 MiB
    (20_261_111, "hard"), // 2026-11-09: 248 MiB
    (20_261_111, "easy"), // 2026-11-11: 248 MiB
    (20_261_214, "easy"), // 2026-12-14: 232 MiB
    (20_261_020, "hard"), // 2026-10-18: 140 MiB
];

#[test]
fn a_solve_visits_each_board_layout_at_most_once() {
    for (seed, difficulty) in HEAVY_DAYS {
        let (made, states) = generate_counted(seed, Some(difficulty));
        assert!(made.is_ok(), "seed {seed} {difficulty}: {made:?}");
        assert!(
            states <= MOST_LAYOUTS,
            "seed {seed} {difficulty}: one solve visited {states} states"
        );
    }
}

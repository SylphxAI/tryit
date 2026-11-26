//! Free daily puzzle payloads and finish grading for specific games.

// Keep test entry points here so their fully qualified names stay stable.
mod crossword_and_groups;
mod guess_and_crowns;
mod support;

#[tokio::test]
async fn connect_crossword_free_floor_can_finish_win() {
    crossword_and_groups::connect_crossword_free_floor_can_finish_win().await;
}

#[tokio::test]
async fn connect_get_daily_word_groups_serves_non_stub_puzzle_data() {
    crossword_and_groups::connect_get_daily_word_groups_serves_non_stub_puzzle_data().await;
}

#[tokio::test]
async fn connect_word_groups_free_floor_can_finish_win() {
    crossword_and_groups::connect_word_groups_free_floor_can_finish_win().await;
}

#[tokio::test]
async fn connect_word_groups_free_floor_can_finish_loss() {
    crossword_and_groups::connect_word_groups_free_floor_can_finish_loss().await;
}

#[tokio::test]
async fn connect_word_groups_rejects_false_win() {
    crossword_and_groups::connect_word_groups_rejects_false_win().await;
}

#[test]
fn word_groups_one_finish_guard_keys_guest_module_day() {
    crossword_and_groups::word_groups_one_finish_guard_keys_guest_module_day();
}

#[tokio::test]
async fn connect_get_daily_word_guess_guest_path() {
    guess_and_crowns::connect_get_daily_word_guess_guest_path().await;
}

#[tokio::test]
async fn connect_get_daily_crowns_guest_path() {
    guess_and_crowns::connect_get_daily_crowns_guest_path().await;
}

#[tokio::test]
async fn connect_word_guess_free_floor_can_finish_win() {
    guess_and_crowns::connect_word_guess_free_floor_can_finish_win().await;
}

#[tokio::test]
async fn connect_crowns_free_floor_can_finish_win() {
    guess_and_crowns::connect_crowns_free_floor_can_finish_win().await;
}

#[tokio::test]
async fn connect_crowns_free_floor_can_finish_loss() {
    guess_and_crowns::connect_crowns_free_floor_can_finish_loss().await;
}

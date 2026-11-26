//! Browser identity boundary through the real router and migrated scratch DB.
#![allow(clippy::unwrap_used)]

mod account_erasure;
mod adoption;
mod concurrent_first_writes;
mod cookie_issuance;
mod daily_play;
mod identity_isolation;
mod legacy_claim;
mod support;

// Register tests here to keep the flat names checked by Migration Integrity.
#[tokio::test]
async fn account_erasure_includes_retained_adopted_guest_collisions_and_provenance() {
    account_erasure::account_erasure_includes_retained_adopted_guest_collisions_and_provenance()
        .await;
}

#[tokio::test]
async fn raced_adoption_and_erasure_preserve_only_unclaimed_guest_or_erase_linked_sources() {
    account_erasure::raced_adoption_and_erasure_preserve_only_unclaimed_guest_or_erase_linked_sources().await;
}

#[tokio::test]
async fn issued_cookie_is_fresh_host_only_and_progress_adopts_without_deleting_collisions() {
    adoption::issued_cookie_is_fresh_host_only_and_progress_adopts_without_deleting_collisions()
        .await;
}

#[tokio::test]
async fn freeze_failure_rolls_back_adoption_and_keeps_credential_live() {
    adoption::freeze_failure_rolls_back_adoption_and_keeps_credential_live().await;
}

#[tokio::test]
async fn private_access_lease_serializes_adoption_and_revocation() {
    adoption::private_access_lease_serializes_adoption_and_revocation().await;
}

#[tokio::test]
async fn four_concurrent_submits_with_two_connections_do_not_hold_pool_during_content_lookup() {
    concurrent_first_writes::four_concurrent_submits_with_two_connections_do_not_hold_pool_during_content_lookup().await;
}

#[tokio::test]
async fn fifty_parallel_first_write_pairs_keep_one_winning_namespace_each() {
    concurrent_first_writes::fifty_parallel_first_write_pairs_keep_one_winning_namespace_each()
        .await;
}

#[tokio::test]
async fn production_origins_issue_and_reuse_host_only_cookies_without_database_effects() {
    cookie_issuance::production_origins_issue_and_reuse_host_only_cookies_without_database_effects(
    )
    .await;
}

#[tokio::test]
async fn issuance_rejects_origin_ambiguity_without_database_effects() {
    cookie_issuance::issuance_rejects_origin_ambiguity_without_database_effects().await;
}

#[tokio::test]
async fn issuance_header_refusal_precedes_unavailable_database_and_supplied_credentials() {
    cookie_issuance::issuance_header_refusal_precedes_unavailable_database_and_supplied_credentials().await;
}

#[tokio::test]
async fn existing_cookie_parallel_bootstrap_keeps_one_registry_player() {
    cookie_issuance::existing_cookie_parallel_bootstrap_keeps_one_registry_player().await;
}

#[tokio::test]
async fn bootstrap_is_zero_database_and_unknown_read_does_not_allocate() {
    cookie_issuance::bootstrap_is_zero_database_and_unknown_read_does_not_allocate().await;
}

#[tokio::test]
async fn legacy_claim_without_database_is_unavailable_so_the_client_keeps_its_key() {
    cookie_issuance::legacy_claim_without_database_is_unavailable_so_the_client_keeps_its_key()
        .await;
}

#[tokio::test]
async fn plain_bootstrap_without_database_still_issues() {
    cookie_issuance::plain_bootstrap_without_database_still_issues().await;
}

#[tokio::test]
async fn passive_daily_reads_are_boardless_and_concurrent_starts_share_three_picks() {
    daily_play::passive_daily_reads_are_boardless_and_concurrent_starts_share_three_picks().await;
}

#[tokio::test]
async fn first_graded_guess_claims_a_pick_and_keeps_one_guess_budget() {
    daily_play::first_graded_guess_claims_a_pick_and_keeps_one_guess_budget().await;
}

#[tokio::test]
async fn invalid_submit_rolls_back_allocation_and_adoption_until_valid_finish() {
    daily_play::invalid_submit_rolls_back_allocation_and_adoption_until_valid_finish().await;
}

#[tokio::test]
async fn unsigned_ids_and_forged_internal_headers_cannot_read_or_adopt() {
    identity_isolation::unsigned_ids_and_forged_internal_headers_cannot_read_or_adopt().await;
}

#[tokio::test]
async fn allocation_collision_never_aliases_existing_account_or_guest() {
    identity_isolation::allocation_collision_never_aliases_existing_account_or_guest().await;
}

#[tokio::test]
async fn second_guest_cookie_never_reads_or_adopts_a_public_player_id() {
    identity_isolation::second_guest_cookie_never_reads_or_adopts_a_public_player_id().await;
}

#[tokio::test]
async fn legacy_guest_write_and_completion_paths_have_no_player_effects() {
    identity_isolation::legacy_guest_write_and_completion_paths_have_no_player_effects().await;
}

#[tokio::test]
async fn legacy_claim_keeps_streak_and_history_and_leaves_nothing_under_legacy() {
    legacy_claim::legacy_claim_keeps_streak_and_history_and_leaves_nothing_under_legacy().await;
}

#[tokio::test]
async fn replaying_the_legacy_id_with_another_token_claims_nothing() {
    legacy_claim::replaying_the_legacy_id_with_another_token_claims_nothing().await;
}

#[tokio::test]
async fn account_backed_or_registered_legacy_id_is_refused() {
    legacy_claim::account_backed_or_registered_legacy_id_is_refused().await;
}

#[tokio::test]
async fn two_concurrent_legacy_claims_have_exactly_one_winner() {
    legacy_claim::two_concurrent_legacy_claims_have_exactly_one_winner().await;
}

#[tokio::test]
async fn wrong_origin_legacy_claim_is_forbidden_without_database_effect() {
    legacy_claim::wrong_origin_legacy_claim_is_forbidden_without_database_effect().await;
}

#[tokio::test]
async fn signed_in_player_with_legacy_id_ends_with_history_on_the_account() {
    legacy_claim::signed_in_player_with_legacy_id_ends_with_history_on_the_account().await;
}

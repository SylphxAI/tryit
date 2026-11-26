//! Migrated, isolated populated cohorts through the production Connect router.
//! No production row reads, fixture endpoint or client-supplied ranking authority.
#![allow(clippy::unwrap_used)]

mod cohorts;
mod integrity;
mod ordering;
mod support;

#[tokio::test]
async fn accepted_cohort_percentile_every_game_strict_ties_and_authority() {
    cohorts::every_game_strict_ties_and_authority().await;
}

#[tokio::test]
async fn accepted_cohort_percentile_excludes_wrong_cohorts_and_orders_losses() {
    ordering::excludes_wrong_cohorts_and_orders_losses().await;
}

#[tokio::test]
async fn accepted_cohort_percentile_empty_small_missing_data_and_unavailable_are_honest() {
    integrity::empty_small_missing_data_and_unavailable_are_honest().await;
}

#[tokio::test]
async fn accepted_cohort_percentile_submission_persists_hints_and_verification_exclusion() {
    integrity::submission_persists_hints_and_verification_exclusion().await;
}

#[tokio::test]
async fn accepted_cohort_percentile_archive_id_cannot_masquerade_as_today() {
    integrity::archive_id_cannot_masquerade_as_today().await;
}

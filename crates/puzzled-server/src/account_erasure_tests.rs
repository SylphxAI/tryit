//! Account erasure end to end: deleting an account in the app must also
//! delete the player's Sylphx Auth sign-in.
//!
//! The product's rows and the Auth subject are two halves of one person, so
//! `DeleteAccountData` deletes the rows and files Auth's privacy delete for
//! every subject that names the player inside one transaction, and commits
//! only after Auth accepted: a refusal or a failure rolls the rows back and
//! the request never reports a success it did not have. Needs `PUZZLED_TEST_DATABASE_URL` (a server where a
//! throwaway database can be created); CI sets it and
//! `PUZZLED_REQUIRE_DB_TESTS=1`, so a missing database fails there instead of
//! skipping.

mod ambiguous_auth;
mod fixtures;
mod operator_command;
mod request_contract;
mod transaction_lifecycle;

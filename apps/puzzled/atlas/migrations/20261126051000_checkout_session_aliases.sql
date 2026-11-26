-- Route processor return IDs to canonical Money resources. This table is not
-- evidence of ownership or settlement; both are re-checked with Money.
CREATE TABLE checkout_session_aliases (
    processor_session_id TEXT PRIMARY KEY,
    money_session_id TEXT NOT NULL
);

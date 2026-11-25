use super::USER_KEYED_COLUMNS;
use std::collections::BTreeSet;
use std::path::Path;

/// Player-id columns declared by the migrations, as (table, column).
fn player_id_columns_in_migrations() -> BTreeSet<(String, String)> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps/puzzled/atlas/migrations");
    let mut sql = String::new();
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "sql"))
        .collect();
    files.sort();
    for file in files {
        sql.push_str(&std::fs::read_to_string(&file).unwrap_or_default());
        sql.push('\n');
    }

    let is_player_column = |name: &str| {
        name == "user_id"
            || name.ends_with("_user_id")
            || name == "actor_id"
            || name == "adopted_from_guest"
    };
    let mut found = BTreeSet::new();
    let mut table: Option<String> = None;
    for line in sql.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("CREATE TABLE ") {
            table = rest
                .trim_start_matches("IF NOT EXISTS ")
                .split('"')
                .find(|part| !part.is_empty() && *part != "public" && *part != ".")
                .map(str::to_string);
            continue;
        }
        if trimmed.starts_with(");") {
            table = None;
            continue;
        }
        if let Some(table) = &table {
            if let Some(column) = trimmed
                .strip_prefix('"')
                .and_then(|rest| rest.split('"').next())
            {
                if is_player_column(column) {
                    found.insert((table.clone(), column.to_string()));
                }
            }
        }
        // A table renamed to `..._retired_...` is empty (its migration
        // refuses to run over rows), so it holds no player data to erase.
        if let Some(rest) = trimmed.strip_prefix("ALTER TABLE ") {
            let parts: Vec<&str> = rest.split('"').collect();
            if let (Some(old), true) = (
                parts.get(1),
                parts.iter().any(|p| p.contains("RENAME TO"))
                    && parts.get(3).is_some_and(|new| new.contains("__retired_")),
            ) {
                found.retain(|(t, _)| t != old);
            }
        }
        // ALTER TABLE "t" ADD COLUMN "user_id" ...
        if let Some(rest) = trimmed.strip_prefix("ALTER TABLE ") {
            let parts: Vec<&str> = rest.split('"').collect();
            if let (Some(t), Some(pos)) = (
                parts.get(1),
                parts.iter().position(|p| p.contains("ADD COLUMN")),
            ) {
                if let Some(column) = parts.get(pos + 1) {
                    if is_player_column(column) {
                        found.insert(((*t).to_string(), (*column).to_string()));
                    }
                }
            }
        }
    }
    found
}

#[test]
fn a_dropped_connection_is_transient_and_a_refusal_is_not() {
    use super::is_transient;
    let reset = std::io::Error::new(std::io::ErrorKind::ConnectionReset, "reset by peer");
    assert!(is_transient(&sqlx::Error::Io(reset)));
    assert!(is_transient(&sqlx::Error::PoolTimedOut));
    assert!(!is_transient(&sqlx::Error::RowNotFound));
    assert!(!is_transient(&sqlx::Error::Protocol("bad".into())));
}

#[test]
fn each_statement_erases_its_own_column() {
    for (table, column, statement) in USER_KEYED_COLUMNS {
        let delete = format!(r#"DELETE FROM "{table}" WHERE "{column}" = $1"#);
        assert_eq!(*statement, delete);
    }
}

/// Puzzled's former billing tables. Sylphx Money holds subscriptions and
/// the ledger now; these tables are kept, unread and unwritten, until the
/// contract migration after Money live proof retires them (its guard
/// refuses to run over any row). No code touches them, so erasure has
/// nothing to erase there: `retiring_billing_tables_have_no_runtime_reader`
/// holds that.
const RETIRING_TABLES: [&str; 3] = [
    "billing_customers",
    "billing_subscriptions",
    "billing_ledger",
];

#[test]
fn erasure_covers_every_player_id_column() {
    let declared: BTreeSet<(String, String)> = player_id_columns_in_migrations()
        .into_iter()
        .filter(|(table, _)| !RETIRING_TABLES.contains(&table.as_str()))
        .collect();
    assert!(
        !declared.is_empty(),
        "no player-id columns parsed from migrations"
    );
    let covered: BTreeSet<(String, String)> = USER_KEYED_COLUMNS
        .iter()
        .map(|(t, c, _)| ((*t).to_string(), (*c).to_string()))
        .collect();
    let missing: Vec<_> = declared.difference(&covered).collect();
    assert!(
        missing.is_empty(),
        "player-id columns missing from USER_KEYED_COLUMNS: {missing:?}"
    );
    let stale: Vec<_> = covered.difference(&declared).collect();
    assert!(
        stale.is_empty(),
        "USER_KEYED_COLUMNS names columns no migration declares: {stale:?}"
    );
}

/// No runtime code path (server, core, or web app) names a retiring
/// billing table: they stay only for schema/migration parity until the
/// contract migration. Tests and the Drizzle schema are the exceptions.
#[test]
fn retiring_billing_tables_have_no_runtime_reader() {
    fn walk(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
            .flatten()
        {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out);
            } else {
                out.push(path);
            }
        }
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut files = Vec::new();
    for dir in [
        "crates/puzzled-core/src",
        "crates/puzzled-server/src",
        "apps/puzzled/src",
    ] {
        walk(&root.join(dir), &mut files);
    }
    let schema = root.join("apps/puzzled/src/lib/db/schema.ts");
    let needles = RETIRING_TABLES
        .iter()
        .map(|t| (*t).to_string())
        .chain(
            ["billingCustomers", "billingSubscriptions", "billingLedger"]
                .iter()
                .map(|n| (*n).to_string()),
        )
        .collect::<Vec<_>>();
    // The scan sees the schema, so an empty result is not a blind scan.
    let schema_text = std::fs::read_to_string(&schema).unwrap_or_default();
    assert!(
        needles.iter().all(|n| schema_text.contains(n.as_str())),
        "the Drizzle schema no longer defines the retiring tables; update this test"
    );
    let mut readers = Vec::new();
    for file in &files {
        let name = file
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        let runtime = match file.extension().and_then(|e| e.to_str()) {
            Some("rs") => !name.ends_with("tests.rs"),
            Some("ts" | "tsx") => !name.contains(".test.") && !file.ends_with("lib/db/schema.ts"),
            _ => false,
        };
        // Identity classification only asks whether a historic account
        // exists; it does not consume billing entitlements or payments.
        if !runtime || file.ends_with("identity_access/adapters/guest_credentials.rs") {
            continue;
        }
        let text = std::fs::read_to_string(file).unwrap_or_default();
        let code = text.split("#[cfg(test)]").next().unwrap_or_default();
        for needle in &needles {
            if code.contains(needle.as_str()) {
                readers.push(format!("{}: {needle}", file.display()));
            }
        }
    }
    assert!(
        readers.is_empty(),
        "runtime code names a retiring billing table: {readers:?}"
    );
}

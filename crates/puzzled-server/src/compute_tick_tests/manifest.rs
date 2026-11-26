use super::support::COMPUTE_PATHS;

// Read the manifest's line-oriented fields without a test-only dependency.
// A table ends at the next header, so another service's prefixes cannot count.
fn manifest_tables<'a>(
    lines: &'a [&'a str],
    header: &'a str,
) -> impl Iterator<Item = &'a [&'a str]> {
    lines
        .iter()
        .enumerate()
        .filter(move |&(_, line)| *line == header)
        .map(|(i, _)| {
            let fields = &lines[i + 1..];
            let end = fields
                .iter()
                .position(|line| line.starts_with('['))
                .unwrap_or(fields.len());
            &fields[..end]
        })
}

fn manifest_field<'a>(table: &[&'a str], key: &str) -> Option<&'a str> {
    table.iter().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        (name.trim() == key).then_some(value.trim())
    })
}

fn manifest_string(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or_else(|| panic!("expected a quoted manifest string: {value}"))
}

pub(super) fn assert_schedule_coverage() {
    let lines: Vec<&str> = include_str!("../../../../sylphx.toml")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();
    let api = manifest_tables(&lines, "[[services]]")
        .find(|table| manifest_field(table, "name").map(manifest_string) == Some("api"))
        .unwrap_or_else(|| panic!("api service missing from manifest"));
    let entries = api
        .iter()
        .position(|line| {
            line.split_once('=')
                .is_some_and(|(key, value)| key.trim() == "path_prefixes" && value.trim() == "[")
        })
        .map(|i| &api[i + 1..])
        .unwrap_or_else(|| panic!("api path_prefixes missing from manifest"));
    let end = entries
        .iter()
        .position(|line| *line == "]")
        .unwrap_or_else(|| panic!("unterminated api path_prefixes"));
    let prefixes: Vec<&str> = entries[..end]
        .iter()
        .map(|entry| manifest_string(entry.trim_end_matches(',').trim_end()))
        .collect();

    let declared: Vec<&str> = manifest_tables(&lines, "[[compute.schedules]]")
        .map(|schedule| {
            assert!(schedule.iter().any(|line| line.contains("signed = true")));
            let path = manifest_field(schedule, "path")
                .map(manifest_string)
                .unwrap_or_else(|| panic!("schedule path missing"));
            let service = manifest_field(schedule, "service")
                .map(manifest_string)
                .unwrap_or_else(|| panic!("Compute callback {path} has no target service"));
            if service == "api" {
                assert!(
                    prefixes.iter().any(|prefix| {
                        path == *prefix
                            || path
                                .strip_prefix(*prefix)
                                .is_some_and(|suffix| suffix.starts_with('/'))
                    }),
                    "Compute callback {path} is not routed by api path_prefixes"
                );
            }
            path
        })
        .collect();
    assert_eq!(declared.len(), COMPUTE_PATHS.len());
    for path in COMPUTE_PATHS {
        assert!(declared.contains(&path), "callback not declared: {path}");
    }
}

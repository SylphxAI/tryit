use serde_json::Value;

/// Log-only text from a Money problem body (`message` = its `detail` string,
/// plus `reason` and `processor_code` from `details[]`). Only these fields are
/// read, ids are limited to a safe alphabet, and anything shaped like a key is
/// redacted, so no secret can reach the log through it.
pub(super) fn problem_note(body: &Value) -> String {
    let safe_id = |v: &Value| {
        v.as_str()
            .filter(|s| !s.is_empty() && s.len() <= 64)
            .filter(|s| {
                s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_-.:".contains(c))
            })
            .map(str::to_string)
    };
    let detail = |key: &str| {
        let list = body.get("details").and_then(Value::as_array);
        list.into_iter()
            .flatten()
            .chain(body.get("detail").filter(|d| d.is_object()))
            .find_map(|d| d.get(key).and_then(safe_id))
    };
    let mut parts = Vec::new();
    if let Some(reason) = detail("reason") {
        parts.push(format!("reason={reason}"));
    }
    if let Some(code) = detail("processor_code") {
        parts.push(format!("processor_code={code}"));
    }
    if let Some(message) = body.get("detail").and_then(Value::as_str) {
        let clean: String = message
            .split_whitespace()
            .map(|w| {
                let w = w.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '_');
                if ["sk_", "rk_", "pk_", "whsec_", "clm_", "Bearer"]
                    .iter()
                    .any(|p| w.starts_with(p))
                {
                    "[redacted]"
                } else {
                    w
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        if !clean.is_empty() {
            parts.push(format!(
                "message={}",
                clean.chars().take(200).collect::<String>()
            ));
        }
    }
    parts.join(" ")
}

/// Why a Money call did not answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MoneyError {
    /// Money could not be reached or answered 5xx / unreadable.
    Unavailable(String),
    /// Money answered with a refusal (4xx); `code` is its problem code.
    /// `note` is the log-only extra (message, reason, processor code); it is
    /// never matched on and never shown to a player.
    Refused {
        status: u16,
        code: String,
        note: String,
    },
}

impl std::fmt::Display for MoneyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(why) => write!(f, "money unavailable: {why}"),
            Self::Refused { status, code, note } if note.is_empty() => {
                write!(f, "money refused ({status}): {code}")
            }
            Self::Refused { status, code, note } => {
                write!(f, "money refused ({status}): {code} [{note}]")
            }
        }
    }
}

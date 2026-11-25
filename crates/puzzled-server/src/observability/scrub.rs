const REDACTED: &str = "[redacted]";
const KEY_WORDS: [&str; 7] = [
    "secret",
    "token",
    "password",
    "passwd",
    "key",
    "authorization",
    "cookie",
];
const KEY_PREFIXES: [&str; 11] = [
    "sylphx_",
    "sk_",
    "pk_",
    "rk_",
    "ghp_",
    "gho_",
    "ghs_",
    "ghu_",
    "github_pat_",
    "xoxb-",
    "xoxp-",
];

/// Replaces secrets with `[redacted]`: emails, `Bearer`/`Basic` credentials,
/// JWTs, API keys (`sylphx_`, `sk_`, `pk_`, `ghp_` ...), values of
/// `key=value` / `"key":"value"` pairs whose key contains secret, token,
/// password, key, authorization or cookie, long (32+ characters) hex or
/// base64-like strings, and 13-19 digit card-like numbers. Ordinary text is
/// left as is.
pub fn scrub(input: &str) -> String {
    let text = scrub_bearer(input);
    let text = scrub_cards(&text);
    let text = scrub_pairs(&text);
    scrub_words(&text)
}

fn is_credential_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'~' | b'+' | b'/' | b'=' | b'-')
}

fn scrub_bearer(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let (mut cursor, mut from) = (0, 0);
    while from < lower.len() {
        let hit = ["bearer ", "basic "]
            .iter()
            .filter_map(|scheme| {
                let mut search = from;
                while let Some(i) = lower[search..].find(scheme) {
                    let start = search + i;
                    if start == 0 || !bytes[start - 1].is_ascii_alphanumeric() {
                        return Some((start, start + scheme.len()));
                    }
                    search = start + 1;
                }
                None
            })
            .min();
        let Some((start, after)) = hit else { break };
        let mut end = after;
        while end < bytes.len() && is_credential_byte(bytes[end]) {
            end += 1;
        }
        if end - after >= 8 {
            out.push_str(&text[cursor..start]);
            out.push_str(REDACTED);
            cursor = end;
        }
        from = end.max(after);
    }
    out.push_str(&text[cursor..]);
    out
}

/// 13-19 digits, optionally grouped by single spaces or dashes.
fn scrub_cards(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let (mut cursor, mut i) = (0, 0);
    while i < bytes.len() {
        let starts_run =
            bytes[i].is_ascii_digit() && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric());
        if !starts_run {
            i += 1;
            continue;
        }
        let (mut j, mut digits) = (i, 0);
        loop {
            if j < bytes.len() && bytes[j].is_ascii_digit() {
                digits += 1;
                j += 1;
            } else if j + 1 < bytes.len()
                && matches!(bytes[j], b' ' | b'-')
                && bytes[j + 1].is_ascii_digit()
            {
                j += 1;
            } else {
                break;
            }
        }
        if (13..=19).contains(&digits) {
            out.push_str(&text[cursor..i]);
            out.push_str(REDACTED);
            cursor = j;
        }
        i = j;
    }
    out.push_str(&text[cursor..]);
    out
}

fn is_key_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-')
}

/// Redacts the value after `key=` / `key:` / `"key":` when the key contains a
/// secret-like word.
fn scrub_pairs(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(text.len());
    let (mut cursor, mut pos) = (0, 0);
    while pos < len {
        let Some((_, kend)) = KEY_WORDS
            .iter()
            .filter_map(|k| lower[pos..].find(k).map(|i| (pos + i, pos + i + k.len())))
            .min()
        else {
            break;
        };
        let mut i = kend;
        while i < len && is_key_byte(bytes[i]) {
            i += 1;
        }
        if i < len && matches!(bytes[i], b'"' | b'\'') {
            i += 1;
        }
        while i < len && matches!(bytes[i], b' ' | b'\t') {
            i += 1;
        }
        let mut next = kend;
        if i < len && matches!(bytes[i], b':' | b'=') && bytes.get(i + 1) != Some(&b':') {
            i += 1;
            while i < len && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < len {
                let end = match bytes[i] {
                    q @ (b'"' | b'\'') => {
                        text[i + 1..].find(q as char).map_or(len, |p| i + 1 + p + 1)
                    }
                    _ => {
                        let mut e = i;
                        while e < len
                            && !bytes[e].is_ascii_whitespace()
                            && !matches!(bytes[e], b',' | b';' | b'&' | b'}' | b')' | b']')
                        {
                            e += 1;
                        }
                        e
                    }
                };
                if end > i {
                    out.push_str(&text[cursor..i]);
                    out.push_str(REDACTED);
                    cursor = end;
                    next = end;
                }
            }
        }
        pos = next;
    }
    out.push_str(&text[cursor..]);
    out
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric()
        || matches!(
            b,
            b'_' | b'-' | b'.' | b'+' | b'/' | b'=' | b'@' | b'%' | b'~'
        )
}

fn is_secret_word(word: &str) -> bool {
    if word.starts_with("eyJ") && word.len() >= 16 && word.contains('.') {
        return true;
    }
    let lower = word.to_ascii_lowercase();
    if KEY_PREFIXES
        .iter()
        .any(|p| lower.starts_with(p) && word.len() >= p.len() + 8)
    {
        return true;
    }
    if let Some(at) = word.find('@') {
        let domain = &word[at + 1..];
        if at > 0
            && domain.contains('.')
            && !domain.ends_with('.')
            && domain.starts_with(|c: char| c.is_ascii_alphanumeric())
        {
            return true;
        }
    }
    word.len() >= 32
        && word
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'_' | b'=' | b'-'))
        && word.bytes().any(|b| b.is_ascii_digit())
}

fn scrub_words(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let (mut cursor, mut i) = (0, 0);
    while i < bytes.len() {
        if !is_word_byte(bytes[i]) {
            i += 1;
            continue;
        }
        let start = i;
        while i < bytes.len() && is_word_byte(bytes[i]) {
            i += 1;
        }
        let mut end = i;
        while end > start && bytes[end - 1] == b'.' {
            end -= 1;
        }
        if end > start && is_secret_word(&text[start..end]) {
            out.push_str(&text[cursor..start]);
            out.push_str(REDACTED);
            cursor = end;
        }
    }
    out.push_str(&text[cursor..]);
    out
}

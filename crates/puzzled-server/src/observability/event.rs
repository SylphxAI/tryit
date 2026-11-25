use sylphx::observability::{ErrorEvent, StackFrame};

use super::{scrub::scrub, Config, ErrorReport};

pub(super) const MAX_FRAMES: usize = 50;
const MAX_MESSAGE_CHARS: usize = 2000;

fn is_app_path(file: &str) -> bool {
    !file.is_empty()
        && !file.contains("/.cargo/")
        && !file.contains("/registry/")
        && !file.starts_with("/rustc/")
}

fn split_location(loc: &str) -> (String, i32, i32) {
    let parts: Vec<&str> = loc.rsplitn(3, ':').collect();
    match parts.as_slice() {
        [col, line, file] => match (col.parse::<i32>(), line.parse::<i32>()) {
            (Ok(col), Ok(line)) => ((*file).to_owned(), line, col),
            _ => (loc.to_owned(), 0, 0),
        },
        [line, file] => line.parse::<i32>().map_or_else(
            |_| (loc.to_owned(), 0, 0),
            |line| ((*file).to_owned(), line, 0),
        ),
        _ => (loc.to_owned(), 0, 0),
    }
}

/// Panic and backtrace machinery, never the cause.
fn is_infrastructure_frame(function: &str) -> bool {
    [
        "puzzled_server::observability::",
        "std::backtrace",
        "std::panicking",
        "core::panicking",
        "rust_begin_unwind",
        "__rust_",
    ]
    .iter()
    .any(|p| function.contains(p))
}

/// Frames of a `Backtrace` display, innermost first.
fn parse_backtrace(text: &str) -> Vec<StackFrame> {
    let mut frames: Vec<StackFrame> = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(location) = line.strip_prefix("at ") {
            if let Some(frame) = frames.last_mut() {
                let (file, line, column) = split_location(location);
                frame.app_frame = is_app_path(&file);
                frame.file_path = file;
                frame.line = line;
                frame.column = column;
            }
        } else if let Some((index, function)) = line.split_once(": ") {
            if !index.is_empty() && index.bytes().all(|b| b.is_ascii_digit()) {
                let mut frame = StackFrame::default();
                frame.function_name = function.to_owned();
                frames.push(frame);
            }
        }
    }
    frames.retain(|f| !is_infrastructure_frame(&f.function_name));
    frames
}

/// The scrubbed error event for one occurrence.
pub fn error_event(report: &ErrorReport, config: &Config) -> ErrorEvent {
    let mut event = ErrorEvent::default();
    event.exception_type = report.exception_type.clone();
    event.message = scrub(
        &report
            .message
            .chars()
            .take(MAX_MESSAGE_CHARS)
            .collect::<String>(),
    );
    event.service_name = config.service.clone();
    event.release = config.release.clone();
    for (key, value) in report.tags.iter().take(60) {
        event.tags.insert(key.clone(), scrub(value));
    }
    if let Some(environment) = &config.environment {
        event
            .tags
            .insert("environment".to_owned(), environment.clone());
    }
    if let Some(route) = &report.route {
        let route = route.split(['?', '#']).next().unwrap_or_default();
        event.tags.insert("route".to_owned(), scrub(route));
        // Group 5xx responses by route and status, not by the message.
        event.fingerprint = format!("{}\n{route}", report.exception_type);
    }

    // Innermost first while building, innermost last on the wire.
    let mut frames = report
        .backtrace
        .as_deref()
        .map(parse_backtrace)
        .unwrap_or_default();
    if let Some(file) = &report.file {
        let line = report
            .line
            .map_or(0, |l| i32::try_from(l).unwrap_or(i32::MAX));
        let known = frames.iter().any(|f| {
            f.line == line
                && !f.file_path.is_empty()
                && (f.file_path.ends_with(file.as_str()) || file.ends_with(&f.file_path))
        });
        if !known {
            let mut frame = StackFrame::default();
            frame.file_path = file.clone();
            frame.line = line;
            frame.app_frame = is_app_path(file);
            frames.insert(0, frame);
        }
    }
    frames.truncate(MAX_FRAMES);
    frames.reverse();
    for frame in &mut frames {
        frame.file_path = scrub(&frame.file_path);
        frame.function_name = scrub(&frame.function_name);
    }
    event.stack_frames = frames;
    event
}

/// Message with digit runs collapsed, so ids and counts do not split a group.
fn message_shape(message: &str) -> String {
    let mut out = String::new();
    let mut in_digits = false;
    for c in message.chars() {
        if c.is_ascii_digit() {
            if !in_digits {
                out.push('#');
            }
            in_digits = true;
        } else {
            in_digits = false;
            out.push(c);
        }
    }
    out
}

/// The event's own fingerprint, else its type plus the top app frame (or the
/// message shape when there is none).
pub(super) fn fingerprint_key(event: &ErrorEvent) -> String {
    if !event.fingerprint.is_empty() {
        return event.fingerprint.clone();
    }
    match event.stack_frames.iter().rev().find(|f| f.app_frame) {
        Some(frame) => format!(
            "{}\n{}:{}:{}",
            event.exception_type, frame.file_path, frame.line, frame.function_name
        ),
        None => format!(
            "{}\n{}",
            event.exception_type,
            message_shape(&event.message)
        ),
    }
}

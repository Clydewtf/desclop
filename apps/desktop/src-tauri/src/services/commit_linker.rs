use chrono::{DateTime, FixedOffset};

#[allow(dead_code)]
#[derive(Debug, PartialEq, Eq)]
pub enum LinkDecision {
    FocusInterval { task_id: String },
    ActiveTask { task_id: String },
    NoLink,
}

#[allow(dead_code)]
pub fn decide_link(
    committed_at: &str,
    focus_started_at: Option<&str>,
    focus_ended_at: Option<&str>,
    focus_task_id: Option<&str>,
    active_task_id: Option<&str>,
) -> LinkDecision {
    if let (Some(started), Some(ended), Some(task_id)) =
        (focus_started_at, focus_ended_at, focus_task_id)
    {
        if is_inside_interval(committed_at, started, ended) {
            return LinkDecision::FocusInterval {
                task_id: task_id.to_string(),
            };
        }
    }

    match active_task_id {
        Some(task_id) => LinkDecision::ActiveTask {
            task_id: task_id.to_string(),
        },
        None => LinkDecision::NoLink,
    }
}

fn is_inside_interval(committed_at: &str, started_at: &str, ended_at: &str) -> bool {
    let parsed = (
        DateTime::parse_from_rfc3339(committed_at),
        DateTime::parse_from_rfc3339(started_at),
        DateTime::parse_from_rfc3339(ended_at),
    );
    match parsed {
        (Ok(committed), Ok(started), Ok(ended)) => {
            let committed: DateTime<FixedOffset> = committed;
            committed >= started && committed <= ended
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_matching_focus_interval() {
        assert_eq!(
            decide_link(
                "2026-05-20T10:10:00Z",
                Some("2026-05-20T10:00:00Z"),
                Some("2026-05-20T10:30:00Z"),
                Some("t1"),
                Some("t2")
            ),
            LinkDecision::FocusInterval {
                task_id: "t1".to_string()
            }
        );
    }

    #[test]
    fn falls_back_to_active_task() {
        assert_eq!(
            decide_link("2026-05-20T11:00:00Z", None, None, None, Some("t1")),
            LinkDecision::ActiveTask {
                task_id: "t1".to_string()
            }
        );
    }

    #[test]
    fn parses_rfc3339_timestamps_for_focus_interval() {
        assert_eq!(
            decide_link(
                "2026-05-20T10:10:00Z",
                Some("2026-05-20T12:00:00+02:00"),
                Some("2026-05-20T12:30:00+02:00"),
                Some("focus-task"),
                Some("active-task")
            ),
            LinkDecision::FocusInterval {
                task_id: "focus-task".to_string()
            }
        );
    }

    #[test]
    fn invalid_focus_timestamps_fall_back_to_active_task() {
        assert_eq!(
            decide_link(
                "not-a-date",
                Some("2026-05-20T10:00:00Z"),
                Some("zzzz"),
                Some("focus-task"),
                Some("active-task")
            ),
            LinkDecision::ActiveTask {
                task_id: "active-task".to_string()
            }
        );
    }
}

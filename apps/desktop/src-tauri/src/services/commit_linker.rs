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
        if committed_at >= started && committed_at <= ended {
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
}

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::ResumeBrief;

struct TaskSummary {
    id: String,
    stage_id: String,
    next_step: String,
}

pub fn build_resume_brief(conn: &Connection, project_id: &str) -> rusqlite::Result<ResumeBrief> {
    let task = match load_active_task(conn, project_id)? {
        Some(task) => Some(task),
        None => load_first_open_task_in_plan_order(conn, project_id)?,
    };
    let current_stage_id = load_current_stage_id(conn, project_id)?;
    let latest_note = load_latest_note(conn, project_id)?;
    let work_entry_count = count_recent_work_entries(conn, project_id)?;
    let open_inbox_count = count_open_inbox_items(conn, project_id)?;
    let commit_count =
        count_linked_commits(conn, project_id, task.as_ref().map(|task| task.id.as_str()))?;
    let commit_branch =
        load_latest_commit_branch(conn, project_id, task.as_ref().map(|task| task.id.as_str()))?;

    let mut facts = Vec::new();
    if commit_count > 0 {
        let branch = commit_branch.unwrap_or_else(|| "unknown branch".to_string());
        facts.push(format!(
            "{commit_count} recent {} captured on {branch}",
            if commit_count == 1 {
                "commit"
            } else {
                "commits"
            }
        ));
    }
    if work_entry_count > 0 {
        facts.push(format!("{work_entry_count} recent work entries"));
    }
    if open_inbox_count > 0 {
        facts.push(format!("{open_inbox_count} open inbox captures"));
    }
    let generated_at = Utc::now().to_rfc3339();
    let brief = ResumeBrief {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.to_string(),
        task_id: task.as_ref().map(|task| task.id.clone()),
        stage_id: task
            .as_ref()
            .map(|task| task.stage_id.clone())
            .or(current_stage_id),
        latest_note,
        next_step: task
            .as_ref()
            .map(|task| task.next_step.clone())
            .filter(|next_step| !next_step.is_empty())
            .unwrap_or_else(|| "Choose the next concrete step before you stop.".to_string()),
        facts,
        generated_at,
    };

    conn.execute(
        "delete from resume_briefs where project_id = ?1",
        params![project_id],
    )?;

    conn.execute(
        "insert into resume_briefs (id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            brief.id,
            brief.project_id,
            brief.task_id,
            brief.stage_id,
            brief.latest_note,
            brief.next_step,
            serde_json::to_string(&brief.facts).unwrap_or_else(|_| "[]".to_string()),
            brief.generated_at
        ],
    )?;

    Ok(brief)
}

fn load_active_task(conn: &Connection, project_id: &str) -> rusqlite::Result<Option<TaskSummary>> {
    conn.query_row(
        "select tasks.id, tasks.stage_id, tasks.next_step
         from tasks
         inner join projects on projects.active_task_id = tasks.id
         where projects.id = ?1 and tasks.project_id = ?1 and tasks.status != 'done'",
        params![project_id],
        |row| {
            Ok(TaskSummary {
                id: row.get(0)?,
                stage_id: row.get(1)?,
                next_step: row.get(2)?,
            })
        },
    )
    .optional()
}

fn load_first_open_task_in_plan_order(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<Option<TaskSummary>> {
    conn.query_row(
        "select tasks.id, tasks.stage_id, tasks.next_step
         from tasks
         inner join stages on stages.id = tasks.stage_id and stages.project_id = tasks.project_id
         where tasks.project_id = ?1 and tasks.status != 'done'
         order by stages.position asc, tasks.position asc, stages.id asc, tasks.id asc
         limit 1",
        params![project_id],
        |row| {
            Ok(TaskSummary {
                id: row.get(0)?,
                stage_id: row.get(1)?,
                next_step: row.get(2)?,
            })
        },
    )
    .optional()
}

fn load_current_stage_id(conn: &Connection, project_id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "select id
         from stages
         where project_id = ?1 and status = 'current'
         order by position asc, id asc
         limit 1",
        params![project_id],
        |row| row.get(0),
    )
    .optional()
}

fn load_latest_note(conn: &Connection, project_id: &str) -> rusqlite::Result<String> {
    Ok(conn
        .query_row(
            "select body
             from notes
             where project_id = ?1
             order by created_at desc, id asc
             limit 1",
            params![project_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_default())
}

fn count_recent_work_entries(conn: &Connection, project_id: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "select count(*)
         from (
           select id
           from work_entries
           where project_id = ?1
           order by created_at desc
           limit 5
         )",
        params![project_id],
        |row| row.get(0),
    )
}

fn count_open_inbox_items(conn: &Connection, project_id: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "select count(*) from inbox_items where project_id = ?1 and status = 'open'",
        params![project_id],
        |row| row.get(0),
    )
}

fn count_linked_commits(
    conn: &Connection,
    project_id: &str,
    task_id: Option<&str>,
) -> rusqlite::Result<i64> {
    match task_id {
        Some(task_id) => conn.query_row(
            "select count(*)
             from (
               select commits.sha
               from commits
               inner join commit_task_links on commit_task_links.commit_sha = commits.sha
               where commits.project_id = ?1 and commit_task_links.project_id = ?1 and commit_task_links.task_id = ?2
               order by commits.committed_at desc
               limit 5
             )",
            params![project_id, task_id],
            |row| row.get(0),
        ),
        None => conn.query_row(
            "select count(*)
             from (
               select sha
               from commits
               where project_id = ?1
               order by committed_at desc
               limit 5
             )",
            params![project_id],
            |row| row.get(0),
        ),
    }
}

fn load_latest_commit_branch(
    conn: &Connection,
    project_id: &str,
    task_id: Option<&str>,
) -> rusqlite::Result<Option<String>> {
    match task_id {
        Some(task_id) => conn
            .query_row(
                "select commits.branch
                 from commits
                 inner join commit_task_links on commit_task_links.commit_sha = commits.sha
                 where commits.project_id = ?1 and commit_task_links.project_id = ?1 and commit_task_links.task_id = ?2
                 order by commits.committed_at desc
                 limit 1",
                params![project_id, task_id],
                |row| row.get(0),
            )
            .optional(),
        None => conn
            .query_row(
                "select branch
                 from commits
                 where project_id = ?1
                 order by committed_at desc
                 limit 1",
                params![project_id],
                |row| row.get(0),
            )
            .optional(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::domain::CreateWorkEntryInput;
    use crate::repositories::plans::{ImportStage, ImportTask, PlanRepository};
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::work_entries::WorkEntryRepository;

    fn seed_project(conn: &mut Connection) -> (String, String, String) {
        let project = ProjectRepository::new(conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");

        PlanRepository::new(conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![
                        ImportTask {
                            title: "Create local store".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 0,
                        },
                        ImportTask {
                            title: "Last touched task".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 1,
                        },
                    ],
                }],
            )
            .expect("replace plan");

        let active_task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1 and position = 0",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active task id");
        let later_task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1 and position = 1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("later task id");

        conn.execute(
            "update tasks set next_step = 'Run repository tests', updated_at = '2026-05-19T10:00:00Z' where id = ?1",
            params![active_task_id],
        )
        .expect("update active task");
        conn.execute(
            "update tasks set updated_at = '2026-05-20T10:00:00Z' where id = ?1",
            params![later_task_id],
        )
        .expect("update later task");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params![active_task_id, project.id],
        )
        .expect("set active task");

        (project.id, active_task_id, later_task_id)
    }

    #[test]
    fn prefers_active_task_and_builds_facts() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, active_task_id, later_task_id) = seed_project(&mut conn);

        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('n1', ?1, ?2, 'Migration passes', '2026-05-20T10:00:00Z')",
            params![project_id, active_task_id],
        )
        .expect("insert note");
        conn.execute(
            "insert into work_entries (id, project_id, task_id, source, done, remains, next_step, created_at)
             values ('w1', ?1, ?2, 'manual', 'Ran tests', '', '', '2026-05-20T11:00:00Z')",
            params![project_id, active_task_id],
        )
        .expect("insert work entry");
        conn.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values ('i1', ?1, null, 'Capture this', 'note', 'open', '2026-05-20T12:00:00Z', '2026-05-20T12:00:00Z')",
            params![project_id],
        )
        .expect("insert inbox item");
        conn.execute(
            "insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values ('abc123', ?1, 'main', 'Add migration', 'Clyde', '2026-05-20T13:00:00Z', '[]')",
            params![project_id],
        )
        .expect("insert commit");
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('ctl1', ?1, ?2, 'abc123', 'active_task', '2026-05-20T13:00:01Z')",
            params![project_id, active_task_id],
        )
        .expect("insert commit link");

        let brief = build_resume_brief(&conn, &project_id).expect("build resume brief");

        assert_eq!(brief.task_id.as_deref(), Some(active_task_id.as_str()));
        assert_ne!(brief.task_id.as_deref(), Some(later_task_id.as_str()));
        assert_eq!(brief.latest_note, "Migration passes");
        assert_eq!(brief.next_step, "Run repository tests");
        assert!(brief
            .facts
            .contains(&"1 recent commit captured on main".to_string()));
        assert!(brief.facts.contains(&"1 recent work entries".to_string()));
        assert!(brief.facts.contains(&"1 open inbox captures".to_string()));
        assert!(!brief.facts.contains(&"Latest note is ready".to_string()));
    }

    #[test]
    fn uses_work_entry_next_step_propagated_to_active_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, active_task_id, _) = seed_project(&mut conn);

        WorkEntryRepository::new(&conn)
            .create_work_entry(CreateWorkEntryInput {
                project_id: project_id.clone(),
                task_id: Some(active_task_id.clone()),
                source: "manual".to_string(),
                started_at: None,
                ended_at: None,
                duration_seconds: None,
                done: "Reviewed repository propagation".to_string(),
                remains: "Verify resume brief".to_string(),
                next_step: "Run cargo test".to_string(),
            })
            .expect("create work entry");

        let brief = build_resume_brief(&conn, &project_id).expect("build resume brief");

        assert_eq!(brief.task_id.as_deref(), Some(active_task_id.as_str()));
        assert_eq!(brief.next_step, "Run cargo test");
    }

    #[test]
    fn active_task_has_priority_over_earlier_newer_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, active_task_id, later_task_id) = seed_project(&mut conn);
        conn.execute(
            "update tasks set updated_at = '2026-05-21T10:00:00Z' where id = ?1",
            params![active_task_id],
        )
        .expect("make earlier task newer");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params![later_task_id, project_id],
        )
        .expect("select later task");

        let brief = build_resume_brief(&conn, &project_id).expect("build resume brief");

        assert_eq!(brief.task_id.as_deref(), Some(later_task_id.as_str()));
    }

    #[test]
    fn falls_back_to_first_unfinished_task_in_plan_order_across_stages() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");

        PlanRepository::new(&mut conn)
            .replace_plan(
                &project.id,
                vec![
                    ImportStage {
                        title: "Foundation".to_string(),
                        description: "".to_string(),
                        position: 0,
                        tasks: vec![ImportTask {
                            title: "First planned task".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 5,
                        }],
                    },
                    ImportStage {
                        title: "Delivery".to_string(),
                        description: "".to_string(),
                        position: 1,
                        tasks: vec![ImportTask {
                            title: "Later stage task".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 0,
                        }],
                    },
                ],
            )
            .expect("replace plan");

        let first_task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1 and title = 'First planned task'",
                params![project.id],
                |row| row.get(0),
            )
            .expect("first planned task id");
        conn.execute(
            "update tasks set updated_at = case title
               when 'First planned task' then '2026-05-19T10:00:00Z'
               else '2026-05-20T10:00:00Z'
             end
             where project_id = ?1",
            params![project.id],
        )
        .expect("set task update order");

        let brief = build_resume_brief(&conn, &project.id).expect("build resume brief");

        assert_eq!(brief.task_id.as_deref(), Some(first_task_id.as_str()));
    }

    #[test]
    fn completed_task_is_not_selected_for_today() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, active_task_id, later_task_id) = seed_project(&mut conn);
        conn.execute(
            "update projects set active_task_id = null where id = ?1",
            params![project_id],
        )
        .expect("clear active task");
        conn.execute(
            "update tasks set status = 'done' where id = ?1",
            params![active_task_id],
        )
        .expect("complete first task");

        let brief = build_resume_brief(&conn, &project_id).expect("build resume brief");

        assert_eq!(brief.task_id.as_deref(), Some(later_task_id.as_str()));
        assert_ne!(brief.task_id.as_deref(), Some(active_task_id.as_str()));
    }

    #[test]
    fn rebuilding_resume_brief_does_not_grow_saved_briefs() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, _, _) = seed_project(&mut conn);

        build_resume_brief(&conn, &project_id).expect("build first resume brief");
        build_resume_brief(&conn, &project_id).expect("build second resume brief");

        let saved_count: i64 = conn
            .query_row(
                "select count(*) from resume_briefs where project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("saved resume brief count");

        assert_eq!(saved_count, 1);
    }
}

use chrono::Utc;
use rusqlite::{params, Connection};
use thiserror::Error;
use uuid::Uuid;

pub const PLAN_HAS_TASK_HISTORY_ERROR: &str = "Plan already has task history";

#[derive(Debug, Error)]
pub enum ReplacePlanError {
    #[error("Plan already has task history")]
    TaskHistoryExists,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
}

pub struct PlanRepository<'a> {
    conn: &'a mut Connection,
}

impl<'a> PlanRepository<'a> {
    pub fn new(conn: &'a mut Connection) -> Self {
        Self { conn }
    }

    pub fn replace_plan(
        &mut self,
        project_id: &str,
        stages: Vec<ImportStage>,
    ) -> Result<(), ReplacePlanError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let has_history: i64 = tx.query_row(
            "select exists(
               select 1 from notes where project_id = ?1 and task_id is not null
               union all
               select 1 from work_entries where project_id = ?1 and task_id is not null
               union all
               select 1 from inbox_items where project_id = ?1 and task_id is not null
               union all
               select 1 from commit_task_links where project_id = ?1
               limit 1
             )",
            params![project_id],
            |row| row.get(0),
        )?;
        if has_history != 0 {
            return Err(ReplacePlanError::TaskHistoryExists);
        }

        tx.execute(
            "delete from resume_briefs where project_id = ?1",
            params![project_id],
        )?;
        tx.execute(
            "delete from stages where project_id = ?1",
            params![project_id],
        )?;
        tx.execute(
            "update projects set active_task_id = null where id = ?1",
            params![project_id],
        )?;

        for stage in stages {
            let stage_id = Uuid::new_v4().to_string();
            let status = if stage.position == 0 {
                "current"
            } else {
                "future"
            };
            tx.execute(
                "insert into stages (id, project_id, title, description, position, status, created_at, updated_at)
                 values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    stage_id,
                    project_id,
                    stage.title,
                    stage.description,
                    stage.position,
                    status,
                    now,
                    now
                ],
            )?;

            for task in stage.tasks {
                let task_id = Uuid::new_v4().to_string();
                let task_status = if task.status == "done" {
                    "done"
                } else {
                    "todo"
                };
                tx.execute(
                    "insert into tasks (id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at)
                     values (?1, ?2, ?3, ?4, '', ?5, null, null, '', ?6, ?7, ?8)",
                    params![
                        task_id,
                        project_id,
                        stage_id,
                        task.title,
                        task_status,
                        task.position,
                        now,
                        now
                    ],
                )?;

                for item in task.checklist {
                    tx.execute(
                        "insert into checklist_items (id, task_id, title, completed, position, created_at, updated_at)
                         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            Uuid::new_v4().to_string(),
                            task_id,
                            item.title,
                            item.completed as i32,
                            item.position,
                            now,
                            now
                        ],
                    )?;
                }
            }
        }

        Ok(tx.commit()?)
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStage {
    pub title: String,
    pub description: String,
    pub tasks: Vec<ImportTask>,
    pub position: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTask {
    pub title: String,
    pub status: String,
    pub checklist: Vec<ImportChecklistItem>,
    pub position: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportChecklistItem {
    pub title: String,
    pub completed: bool,
    pub position: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::projects::ProjectRepository;

    fn initial_plan() -> Vec<ImportStage> {
        vec![ImportStage {
            title: "Foundation".to_string(),
            description: "".to_string(),
            position: 0,
            tasks: vec![ImportTask {
                title: "Keep task".to_string(),
                status: "todo".to_string(),
                checklist: vec![],
                position: 0,
            }],
        }]
    }

    fn replacement_plan() -> Vec<ImportStage> {
        vec![ImportStage {
            title: "Replacement".to_string(),
            description: "".to_string(),
            position: 0,
            tasks: vec![ImportTask {
                title: "New task".to_string(),
                status: "todo".to_string(),
                checklist: vec![],
                position: 0,
            }],
        }]
    }

    #[test]
    fn replace_plan_persists_imported_stages_tasks_and_checklist_items() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");
        PlanRepository::new(&mut conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Old stage".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Old task".to_string(),
                        status: "todo".to_string(),
                        checklist: vec![ImportChecklistItem {
                            title: "Old checklist item".to_string(),
                            completed: false,
                            position: 0,
                        }],
                        position: 0,
                    }],
                }],
            )
            .expect("create old plan");
        let old_task_id: String = conn
            .query_row("select id from tasks where title = 'Old task'", [], |row| {
                row.get(0)
            })
            .expect("old task id");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params![old_task_id, project.id],
        )
        .expect("set active task");

        PlanRepository::new(&mut conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Create local store".to_string(),
                        status: "todo".to_string(),
                        checklist: vec![ImportChecklistItem {
                            title: "Add migration".to_string(),
                            completed: true,
                            position: 0,
                        }],
                        position: 0,
                    }],
                }],
            )
            .expect("replace plan");

        let stage_count: i64 = conn
            .query_row("select count(*) from stages", [], |row| row.get(0))
            .expect("stage count");
        let task_title: String = conn
            .query_row("select title from tasks", [], |row| row.get(0))
            .expect("task title");
        let checklist_completed: i64 = conn
            .query_row("select completed from checklist_items", [], |row| {
                row.get(0)
            })
            .expect("checklist completed");
        let old_stage_count: i64 = conn
            .query_row(
                "select count(*) from stages where title = 'Old stage'",
                [],
                |row| row.get(0),
            )
            .expect("old stage count");
        let old_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where title = 'Old task'",
                [],
                |row| row.get(0),
            )
            .expect("old task count");
        let old_checklist_count: i64 = conn
            .query_row(
                "select count(*) from checklist_items where title = 'Old checklist item'",
                [],
                |row| row.get(0),
            )
            .expect("old checklist count");
        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active task id");

        assert_eq!(stage_count, 1);
        assert_eq!(task_title, "Create local store");
        assert_eq!(checklist_completed, 1);
        assert_eq!(old_stage_count, 0);
        assert_eq!(old_task_count, 0);
        assert_eq!(old_checklist_count, 0);
        assert_eq!(active_task_id, None);
    }

    fn project_with_initial_plan() -> (Connection, String, String) {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");
        PlanRepository::new(&mut conn)
            .replace_plan(&project.id, initial_plan())
            .expect("initial plan");
        let task_id: String = conn
            .query_row("select id from tasks limit 1", [], |row| row.get(0))
            .expect("task id");
        (conn, project.id, task_id)
    }

    fn assert_destructive_reimport_blocked(conn: &mut Connection, project_id: &str, task_id: &str) {
        let result = PlanRepository::new(conn).replace_plan(project_id, replacement_plan());

        assert!(matches!(result, Err(ReplacePlanError::TaskHistoryExists)));
        let old_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .expect("task count");
        assert_eq!(old_task_count, 1);
    }

    #[test]
    fn replace_plan_clears_resume_briefs_without_treating_them_as_task_history() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        let stage_id: String = conn
            .query_row(
                "select stage_id from tasks where id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .expect("stage id");
        conn.execute(
            "insert into resume_briefs (id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at)
             values ('brief1', ?1, ?2, ?3, '', '', '{}', '2026-05-20T10:00:00Z')",
            params![project_id, task_id, stage_id],
        )
        .expect("resume brief");

        PlanRepository::new(&mut conn)
            .replace_plan(&project_id, replacement_plan())
            .expect("replace plan");

        let new_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where project_id = ?1 and title = 'New task'",
                params![project_id],
                |row| row.get(0),
            )
            .expect("new task count");
        let resume_brief_count: i64 = conn
            .query_row(
                "select count(*) from resume_briefs where project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("resume brief count");

        assert_eq!(new_task_count, 1);
        assert_eq!(resume_brief_count, 0);
    }

    #[test]
    fn replace_plan_rejects_destructive_reimport_when_notes_reference_tasks() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('n1', ?1, ?2, 'Keep me', '2026-05-20T10:00:00Z')",
            params![project_id, task_id],
        )
        .expect("note");

        assert_destructive_reimport_blocked(&mut conn, &project_id, &task_id);
    }

    #[test]
    fn replace_plan_rejects_destructive_reimport_when_work_entries_reference_tasks() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        conn.execute(
            "insert into work_entries (id, project_id, task_id, source, done, remains, next_step, created_at)
             values ('w1', ?1, ?2, 'manual', 'Done', '', '', '2026-05-20T10:00:00Z')",
            params![project_id, task_id],
        )
        .expect("work entry");

        assert_destructive_reimport_blocked(&mut conn, &project_id, &task_id);
    }

    #[test]
    fn replace_plan_rejects_destructive_reimport_when_inbox_items_reference_tasks() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        conn.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values ('i1', ?1, ?2, 'Follow up', 'task_candidate', 'attached', '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z')",
            params![project_id, task_id],
        )
        .expect("inbox item");

        assert_destructive_reimport_blocked(&mut conn, &project_id, &task_id);
    }

    #[test]
    fn replace_plan_rejects_destructive_reimport_when_commits_are_linked_to_tasks() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        conn.execute(
            "insert into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
             values (?1, 'abc123', 'main', 'Initial', 'Clyde', '2026-05-20T10:00:00Z', '[]')",
            params![project_id],
        )
        .expect("commit");
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link1', ?1, ?2, 'abc123', 'manual', '2026-05-20T10:01:00Z')",
            params![project_id, task_id],
        )
        .expect("commit link");

        assert_destructive_reimport_blocked(&mut conn, &project_id, &task_id);
    }

    #[test]
    fn replace_plan_preserves_note_when_destructive_reimport_is_blocked() {
        let (mut conn, project_id, task_id) = project_with_initial_plan();
        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('n1', ?1, ?2, 'Keep me', '2026-05-20T10:00:00Z')",
            params![project_id, task_id],
        )
        .expect("note");

        assert_destructive_reimport_blocked(&mut conn, &project_id, &task_id);
        let note_count: i64 = conn
            .query_row("select count(*) from notes where id = 'n1'", [], |row| {
                row.get(0)
            })
            .expect("note count");
        assert_eq!(note_count, 1);
    }
}

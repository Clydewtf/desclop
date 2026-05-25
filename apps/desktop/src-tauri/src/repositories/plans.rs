use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

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
    ) -> rusqlite::Result<()> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;

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

        tx.commit()
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
}

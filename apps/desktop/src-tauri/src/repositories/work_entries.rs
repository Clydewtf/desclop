use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{CreateWorkEntryInput, WorkEntry};

pub struct WorkEntryRepository<'a> {
    conn: &'a Connection,
}

impl<'a> WorkEntryRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create_work_entry(&self, input: CreateWorkEntryInput) -> rusqlite::Result<WorkEntry> {
        if let Some(task_id) = &input.task_id {
            self.conn.query_row(
                "select 1 from tasks where id = ?1 and project_id = ?2",
                params![task_id, &input.project_id],
                |_| Ok(()),
            )?;
        } else {
            self.conn.query_row(
                "select 1 from projects where id = ?1",
                params![&input.project_id],
                |_| Ok(()),
            )?;
        }

        let entry = WorkEntry {
            id: Uuid::new_v4().to_string(),
            project_id: input.project_id,
            task_id: input.task_id,
            source: input.source,
            started_at: input.started_at,
            ended_at: input.ended_at,
            duration_seconds: input.duration_seconds,
            done: input.done,
            remains: input.remains,
            next_step: input.next_step,
            created_at: Utc::now().to_rfc3339(),
        };

        self.conn.execute(
            "insert into work_entries (id, project_id, task_id, source, started_at, ended_at, duration_seconds, done, remains, next_step, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &entry.id,
                &entry.project_id,
                &entry.task_id,
                &entry.source,
                &entry.started_at,
                &entry.ended_at,
                &entry.duration_seconds,
                &entry.done,
                &entry.remains,
                &entry.next_step,
                &entry.created_at
            ],
        )?;

        Ok(entry)
    }

    pub fn list_work_entries_for_task(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> rusqlite::Result<Vec<WorkEntry>> {
        let mut stmt = self.conn.prepare(
            "select work_entries.id, work_entries.project_id, work_entries.task_id, work_entries.source,
                    work_entries.started_at, work_entries.ended_at, work_entries.duration_seconds,
                    work_entries.done, work_entries.remains, work_entries.next_step, work_entries.created_at
             from work_entries
             inner join tasks on tasks.id = work_entries.task_id
             where work_entries.project_id = ?1 and work_entries.task_id = ?2 and tasks.project_id = ?1
             order by work_entries.created_at desc, work_entries.id desc",
        )?;

        let rows = stmt.query_map(params![project_id, task_id], |row| {
            Ok(WorkEntry {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                source: row.get(3)?,
                started_at: row.get(4)?,
                ended_at: row.get(5)?,
                duration_seconds: row.get(6)?,
                done: row.get(7)?,
                remains: row.get(8)?,
                next_step: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?;

        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{ImportStage, ImportTask, PlanRepository};
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::tasks::TaskRepository;

    fn seed_project_with_task(conn: &mut Connection, project_name: &str) -> crate::domain::Project {
        let project = ProjectRepository::new(conn)
            .create_project(
                project_name.to_string(),
                format!("/tmp/{project_name}"),
                false,
            )
            .expect("create project");

        PlanRepository::new(conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Create local store".to_string(),
                        status: "todo".to_string(),
                        checklist: vec![],
                        position: 0,
                    }],
                }],
            )
            .expect("replace plan");

        project
    }

    #[test]
    fn create_and_list_work_entries_for_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let other_project = seed_project_with_task(&mut conn, "other");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);

        let entry = repository
            .create_work_entry(CreateWorkEntryInput {
                project_id: project.id.clone(),
                task_id: Some(task.id.clone()),
                source: "manual".to_string(),
                started_at: None,
                ended_at: None,
                duration_seconds: Some(900),
                done: "Added migration".to_string(),
                remains: "Repository tests".to_string(),
                next_step: "Run cargo test".to_string(),
            })
            .expect("create work entry");
        let entries = repository
            .list_work_entries_for_task(&project.id, &task.id)
            .expect("list work entries");
        let cross_project_entries = repository
            .list_work_entries_for_task(&other_project.id, &task.id)
            .expect("list cross-project work entries");

        assert_eq!(entry.duration_seconds, Some(900));
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, entry.id);
        assert_eq!(cross_project_entries.len(), 0);
    }
}

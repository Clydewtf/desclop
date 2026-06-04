use chrono::{DateTime, FixedOffset, Utc};
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
        if matches!(input.duration_seconds, Some(duration_seconds) if duration_seconds < 0) {
            return Err(rusqlite::Error::InvalidParameterName(
                "duration_seconds must be non-negative".to_string(),
            ));
        }
        if let (Some(started_at), Some(ended_at)) = (&input.started_at, &input.ended_at) {
            let started_at = DateTime::parse_from_rfc3339(started_at).map_err(|err| {
                rusqlite::Error::InvalidParameterName(format!("started_at: {err}"))
            })?;
            let ended_at = DateTime::parse_from_rfc3339(ended_at)
                .map_err(|err| rusqlite::Error::InvalidParameterName(format!("ended_at: {err}")))?;
            if ended_at < started_at {
                return Err(rusqlite::Error::InvalidParameterName(
                    "ended_at must be greater than or equal to started_at".to_string(),
                ));
            }
        }

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

        if let Some(task_id) = &entry.task_id {
            if !entry.next_step.trim().is_empty() {
                self.conn.execute(
                    "update tasks set next_step = ?1, updated_at = ?2 where id = ?3 and project_id = ?4",
                    params![&entry.next_step, &entry.created_at, task_id, &entry.project_id],
                )?;
            }
        }

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

    pub fn list_work_entries_for_project(
        &self,
        project_id: &str,
    ) -> rusqlite::Result<Vec<WorkEntry>> {
        let mut stmt = self.conn.prepare(
            "select id, project_id, task_id, source, started_at, ended_at, duration_seconds,
                    done, remains, next_step, created_at
             from work_entries
             where project_id = ?1
             order by created_at desc, id desc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
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

    pub fn focus_interval_containing_commit(
        &self,
        project_id: &str,
        committed_at: &str,
    ) -> rusqlite::Result<Option<(String, String, String)>> {
        let committed_at = DateTime::parse_from_rfc3339(committed_at)
            .map_err(|err| rusqlite::Error::InvalidParameterName(format!("committed_at: {err}")))?;
        let mut stmt = self.conn.prepare(
            "select task_id, started_at, ended_at
             from work_entries
             where project_id = ?1
               and source = 'focus'
               and task_id is not null
               and started_at is not null
               and ended_at is not null
             order by ended_at desc, id desc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;

        for row in rows {
            let (task_id, started_at, ended_at) = row?;
            if contains_commit_time(&committed_at, &started_at, &ended_at) {
                return Ok(Some((task_id, started_at, ended_at)));
            }
        }

        Ok(None)
    }
}

fn contains_commit_time(
    committed_at: &DateTime<FixedOffset>,
    started_at: &str,
    ended_at: &str,
) -> bool {
    let parsed = (
        DateTime::parse_from_rfc3339(started_at),
        DateTime::parse_from_rfc3339(ended_at),
    );
    match parsed {
        (Ok(started_at), Ok(ended_at)) => *committed_at >= started_at && *committed_at <= ended_at,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{ImportStage, ImportTask, PlanRepository};
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::tasks::TaskRepository;

    fn seed_project_with_plan(conn: &mut Connection, project_name: &str) -> crate::domain::Project {
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

    fn valid_input(project_id: String, task_id: String) -> CreateWorkEntryInput {
        CreateWorkEntryInput {
            project_id,
            task_id: Some(task_id),
            source: "manual".to_string(),
            started_at: None,
            ended_at: None,
            duration_seconds: Some(900),
            done: "Added migration".to_string(),
            remains: "Repository tests".to_string(),
            next_step: "Run cargo test".to_string(),
        }
    }

    fn reload_task_next_step(conn: &Connection, project_id: &str, task_id: &str) -> String {
        TaskRepository::new(conn)
            .list_tasks(project_id)
            .expect("reload tasks")
            .into_iter()
            .find(|candidate| candidate.id == task_id)
            .expect("updated task")
            .next_step
    }

    #[test]
    fn create_and_list_work_entries_for_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let other_project = seed_project_with_plan(&mut conn, "other");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);

        let entry = repository
            .create_work_entry(valid_input(project.id.clone(), task.id.clone()))
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

    #[test]
    fn lists_all_work_entries_for_project_timeline() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let other_project = seed_project_with_plan(&mut conn, "other");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let other_task = TaskRepository::new(&conn)
            .list_tasks(&other_project.id)
            .expect("list other tasks")
            .into_iter()
            .next()
            .expect("other task");
        let repository = WorkEntryRepository::new(&conn);

        repository
            .create_work_entry(valid_input(project.id.clone(), task.id.clone()))
            .expect("create work entry");
        repository
            .create_work_entry(valid_input(other_project.id.clone(), other_task.id.clone()))
            .expect("create other work entry");

        let entries = repository
            .list_work_entries_for_project(&project.id)
            .expect("list project work entries");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].project_id, project.id);
    }

    #[test]
    fn create_work_entry_updates_task_next_step_when_present() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);

        repository
            .create_work_entry(CreateWorkEntryInput {
                project_id: project.id.clone(),
                task_id: Some(task.id.clone()),
                source: "manual".to_string(),
                started_at: None,
                ended_at: None,
                duration_seconds: None,
                done: "Added persistence".to_string(),
                remains: "Verify resume brief".to_string(),
                next_step: "Run cargo test".to_string(),
            })
            .expect("create work entry");

        assert_eq!(
            reload_task_next_step(&conn, &project.id, &task.id),
            "Run cargo test".to_string()
        );
    }

    #[test]
    fn create_work_entry_preserves_task_next_step_when_next_step_is_empty() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        TaskRepository::new(&conn)
            .update_next_step(&task.id, "Keep existing step")
            .expect("set existing next step");
        let repository = WorkEntryRepository::new(&conn);

        let mut input = valid_input(project.id.clone(), task.id.clone());
        input.next_step = String::new();
        repository
            .create_work_entry(input)
            .expect("create work entry");

        assert_eq!(
            reload_task_next_step(&conn, &project.id, &task.id),
            "Keep existing step".to_string()
        );
    }

    #[test]
    fn create_work_entry_preserves_task_next_step_when_task_id_is_null() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        TaskRepository::new(&conn)
            .update_next_step(&task.id, "Keep existing step")
            .expect("set existing next step");
        let repository = WorkEntryRepository::new(&conn);

        repository
            .create_work_entry(CreateWorkEntryInput {
                project_id: project.id.clone(),
                task_id: None,
                source: "manual".to_string(),
                started_at: None,
                ended_at: None,
                duration_seconds: None,
                done: "Added persistence".to_string(),
                remains: "Verify resume brief".to_string(),
                next_step: "Run cargo test".to_string(),
            })
            .expect("create work entry");

        assert_eq!(
            reload_task_next_step(&conn, &project.id, &task.id),
            "Keep existing step".to_string()
        );
    }

    #[test]
    fn rejects_negative_duration() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);
        let mut input = valid_input(project.id, task.id);
        input.duration_seconds = Some(-1);

        assert!(repository.create_work_entry(input).is_err());

        let work_entry_count: i64 = conn
            .query_row("select count(*) from work_entries", [], |row| row.get(0))
            .expect("work entry count");
        assert_eq!(work_entry_count, 0);
    }

    #[test]
    fn rejects_inverted_timestamps() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);
        let mut input = valid_input(project.id, task.id);
        input.started_at = Some("2026-05-27T10:00:00Z".to_string());
        input.ended_at = Some("2026-05-27T09:59:59Z".to_string());

        assert!(repository.create_work_entry(input).is_err());

        let work_entry_count: i64 = conn
            .query_row("select count(*) from work_entries", [], |row| row.get(0))
            .expect("work entry count");
        assert_eq!(work_entry_count, 0);
    }

    #[test]
    fn returns_focus_interval_containing_commit() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let repository = WorkEntryRepository::new(&conn);
        let mut older = valid_input(project.id.clone(), task.id.clone());
        older.source = "focus".to_string();
        older.started_at = Some("2026-05-20T09:00:00Z".to_string());
        older.ended_at = Some("2026-05-20T09:30:00Z".to_string());
        let mut newer = valid_input(project.id.clone(), task.id.clone());
        newer.source = "focus".to_string();
        newer.started_at = Some("2026-05-20T10:00:00Z".to_string());
        newer.ended_at = Some("2026-05-20T10:30:00Z".to_string());

        repository.create_work_entry(older).expect("create older");
        repository.create_work_entry(newer).expect("create newer");

        let interval = repository
            .focus_interval_containing_commit(&project.id, "2026-05-20T10:10:00Z")
            .expect("matching focus interval");
        assert_eq!(
            interval,
            Some((
                task.id,
                "2026-05-20T10:00:00Z".to_string(),
                "2026-05-20T10:30:00Z".to_string()
            ))
        );

        let outside_interval = repository
            .focus_interval_containing_commit(&project.id, "2026-05-20T11:00:00Z")
            .expect("outside focus interval");
        assert_eq!(outside_interval, None);
    }
}

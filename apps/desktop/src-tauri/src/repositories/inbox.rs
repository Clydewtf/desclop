use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{InboxItem, Note, Task};
use crate::repositories::tasks::recalculate_stage_statuses;

pub struct InboxRepository<'a> {
    conn: &'a mut Connection,
}

impl<'a> InboxRepository<'a> {
    pub fn new(conn: &'a mut Connection) -> Self {
        Self { conn }
    }

    pub fn capture_item(
        &mut self,
        project_id: &str,
        body: &str,
        kind: &str,
    ) -> rusqlite::Result<InboxItem> {
        self.conn.query_row(
            "select 1 from projects where id = ?1",
            params![project_id],
            |_| Ok(()),
        )?;

        let now = Utc::now().to_rfc3339();
        let item = InboxItem {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            task_id: None,
            body: body.to_string(),
            kind: kind.to_string(),
            status: "open".to_string(),
            created_at: now.clone(),
            updated_at: now,
        };

        self.conn.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &item.id,
                &item.project_id,
                &item.task_id,
                &item.body,
                &item.kind,
                &item.status,
                &item.created_at,
                &item.updated_at
            ],
        )?;

        Ok(item)
    }

    pub fn attach_to_task(&mut self, item_id: &str, task_id: &str) -> rusqlite::Result<InboxItem> {
        let updated_rows = self.conn.execute(
            "update inbox_items
             set task_id = ?1, status = 'attached', updated_at = ?2
             where id = ?3
               and status = 'open'
               and project_id = (select project_id from tasks where id = ?1)",
            params![task_id, Utc::now().to_rfc3339(), item_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        self.get_item(item_id)
    }

    pub fn convert_to_task(&mut self, item_id: &str, stage_id: &str) -> rusqlite::Result<Task> {
        let tx = self.conn.transaction()?;
        let item = get_item_from_conn(&tx, item_id)?;
        if item.status != "open" {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        let stage_project_id: String = tx.query_row(
            "select project_id from stages where id = ?1",
            params![stage_id],
            |row| row.get(0),
        )?;
        if stage_project_id != item.project_id {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        let position = tx.query_row(
            "select coalesce(max(position), -1) + 1 from tasks where stage_id = ?1",
            params![stage_id],
            |row| row.get(0),
        )?;
        let now = Utc::now().to_rfc3339();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            project_id: item.project_id.clone(),
            stage_id: stage_id.to_string(),
            title: item.body.clone(),
            description: String::new(),
            status: "todo".to_string(),
            priority: None,
            due_date: None,
            next_step: String::new(),
            position,
        };

        tx.execute(
            "insert into tasks (id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                &task.id,
                &task.project_id,
                &task.stage_id,
                &task.title,
                &task.description,
                &task.status,
                &task.priority,
                &task.due_date,
                &task.next_step,
                &task.position,
                &now,
                &now
            ],
        )?;
        let updated_rows = tx.execute(
            "update inbox_items
             set task_id = ?1, status = 'converted', updated_at = ?2
             where id = ?3 and status = 'open'",
            params![&task.id, Utc::now().to_rfc3339(), item_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        recalculate_stage_statuses(&tx, &task.project_id)?;
        tx.commit()?;

        Ok(task)
    }

    pub fn keep_as_note(&mut self, item_id: &str) -> rusqlite::Result<Note> {
        let tx = self.conn.transaction()?;
        let item = get_item_from_conn(&tx, item_id)?;
        if item.status != "open" {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        let note = Note {
            id: Uuid::new_v4().to_string(),
            project_id: item.project_id,
            task_id: item.task_id,
            body: item.body,
            created_at: Utc::now().to_rfc3339(),
        };

        tx.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values (?1, ?2, ?3, ?4, ?5)",
            params![
                &note.id,
                &note.project_id,
                &note.task_id,
                &note.body,
                &note.created_at
            ],
        )?;
        let updated_rows = tx.execute(
            "update inbox_items
             set status = 'kept_as_note', updated_at = ?1
             where id = ?2 and status = 'open'",
            params![Utc::now().to_rfc3339(), item_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        tx.commit()?;

        Ok(note)
    }

    pub fn delete_item(&mut self, item_id: &str) -> rusqlite::Result<InboxItem> {
        let updated_rows = self.conn.execute(
            "update inbox_items
             set status = 'deleted', updated_at = ?1
             where id = ?2 and status = 'open'",
            params![Utc::now().to_rfc3339(), item_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        self.get_item(item_id)
    }

    pub fn list_items_for_project(&self, project_id: &str) -> rusqlite::Result<Vec<InboxItem>> {
        let mut stmt = self.conn.prepare(
            "select id, project_id, task_id, body, kind, status, created_at, updated_at
             from inbox_items
             where project_id = ?1
             order by created_at desc, id desc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                body: row.get(3)?,
                kind: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        rows.collect()
    }

    pub fn list_items_for_task(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> rusqlite::Result<Vec<InboxItem>> {
        let mut stmt = self.conn.prepare(
            "select inbox_items.id, inbox_items.project_id, inbox_items.task_id, inbox_items.body,
                    inbox_items.kind, inbox_items.status, inbox_items.created_at, inbox_items.updated_at
             from inbox_items
             inner join tasks on tasks.id = inbox_items.task_id
             where inbox_items.project_id = ?1 and inbox_items.task_id = ?2 and tasks.project_id = ?1
             order by inbox_items.created_at desc, inbox_items.id desc",
        )?;

        let rows = stmt.query_map(params![project_id, task_id], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                body: row.get(3)?,
                kind: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        rows.collect()
    }

    fn get_item(&self, item_id: &str) -> rusqlite::Result<InboxItem> {
        get_item_from_conn(self.conn, item_id)
    }
}

fn get_item_from_conn(conn: &Connection, item_id: &str) -> rusqlite::Result<InboxItem> {
    conn.query_row(
        "select id, project_id, task_id, body, kind, status, created_at, updated_at
         from inbox_items
         where id = ?1",
        params![item_id],
        |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                body: row.get(3)?,
                kind: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
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
                        description: "".to_string(),
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
    fn capture_attach_keep_delete_and_convert_items() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let stage = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages")
            .into_iter()
            .next()
            .expect("stage");
        let mut repository = InboxRepository::new(&mut conn);

        let attached = repository
            .capture_item(&project.id, "Investigate import warning", "question")
            .expect("capture attached");
        let attached = repository
            .attach_to_task(&attached.id, &task.id)
            .expect("attach item");
        let kept = repository
            .capture_item(&project.id, "Keep context note", "note")
            .expect("capture kept");
        let note = repository.keep_as_note(&kept.id).expect("keep as note");
        let deleted = repository
            .capture_item(&project.id, "Delete stale note", "note")
            .expect("capture deleted");
        let deleted = repository.delete_item(&deleted.id).expect("delete item");
        let converted = repository
            .capture_item(&project.id, "Create parser tests", "task_candidate")
            .expect("capture converted");
        let converted_task = repository
            .convert_to_task(&converted.id, &stage.id)
            .expect("convert to task");

        assert_eq!(attached.status, "attached");
        assert_eq!(attached.task_id, Some(task.id.clone()));
        assert_eq!(note.body, "Keep context note");
        assert_eq!(note.task_id, None);
        assert_eq!(deleted.status, "deleted");
        assert_eq!(converted_task.title, "Create parser tests");
    }

    #[test]
    fn lists_all_items_for_project_timeline() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let other_project = seed_project_with_task(&mut conn, "other");
        let mut repository = InboxRepository::new(&mut conn);

        repository
            .capture_item(&project.id, "Project inbox", "question")
            .expect("capture item");
        repository
            .capture_item(&other_project.id, "Other inbox", "question")
            .expect("capture other item");

        let items = repository
            .list_items_for_project(&project.id)
            .expect("list project inbox");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].body, "Project inbox");
    }

    #[test]
    fn lists_items_for_task_with_project_boundary() {
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
        let mut repository = InboxRepository::new(&mut conn);

        let item = repository
            .capture_item(&project.id, "Task inbox", "question")
            .expect("capture item");
        repository
            .attach_to_task(&item.id, &task.id)
            .expect("attach item");

        let project_items = repository
            .list_items_for_task(&project.id, &task.id)
            .expect("list task inbox");
        let cross_project_items = repository
            .list_items_for_task(&other_project.id, &task.id)
            .expect("list cross-project task inbox");

        assert_eq!(project_items.len(), 1);
        assert_eq!(project_items[0].body, "Task inbox");
        assert_eq!(cross_project_items.len(), 0);
    }

    #[test]
    fn repeated_convert_is_rejected_and_does_not_create_duplicate_tasks() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let stage = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages")
            .into_iter()
            .next()
            .expect("stage");

        {
            let mut repository = InboxRepository::new(&mut conn);
            let item = repository
                .capture_item(&project.id, "Create parser tests", "task_candidate")
                .expect("capture converted");

            repository
                .convert_to_task(&item.id, &stage.id)
                .expect("first convert");
            assert!(repository.convert_to_task(&item.id, &stage.id).is_err());
        }

        let created_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where title = 'Create parser tests'",
                [],
                |row| row.get(0),
            )
            .expect("created task count");
        assert_eq!(created_task_count, 1);
    }

    #[test]
    fn delete_then_keep_is_rejected_and_does_not_create_note() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");

        {
            let mut repository = InboxRepository::new(&mut conn);
            let item = repository
                .capture_item(&project.id, "Discarded note", "note")
                .expect("capture item");

            repository.delete_item(&item.id).expect("delete item");
            assert!(repository.keep_as_note(&item.id).is_err());
        }

        let note_count: i64 = conn
            .query_row(
                "select count(*) from notes where body = 'Discarded note'",
                [],
                |row| row.get(0),
            )
            .expect("note count");
        assert_eq!(note_count, 0);
    }

    #[test]
    fn attach_then_convert_is_rejected() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let stage = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages")
            .into_iter()
            .next()
            .expect("stage");

        {
            let mut repository = InboxRepository::new(&mut conn);
            let item = repository
                .capture_item(&project.id, "Attached context", "question")
                .expect("capture item");

            repository
                .attach_to_task(&item.id, &task.id)
                .expect("attach item");
            assert!(repository.convert_to_task(&item.id, &stage.id).is_err());
        }

        let created_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where title = 'Attached context'",
                [],
                |row| row.get(0),
            )
            .expect("created task count");
        assert_eq!(created_task_count, 0);
    }

    #[test]
    fn already_processed_items_reject_other_mutations() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_task(&mut conn, "desclop");
        let task = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .next()
            .expect("task");
        let stage = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages")
            .into_iter()
            .next()
            .expect("stage");

        let mut repository = InboxRepository::new(&mut conn);
        let converted = repository
            .capture_item(&project.id, "Converted once", "task_candidate")
            .expect("capture converted");
        let kept = repository
            .capture_item(&project.id, "Kept once", "note")
            .expect("capture kept");

        repository
            .convert_to_task(&converted.id, &stage.id)
            .expect("convert item");
        repository.keep_as_note(&kept.id).expect("keep item");

        assert!(repository.attach_to_task(&converted.id, &task.id).is_err());
        assert!(repository.delete_item(&converted.id).is_err());
        assert!(repository.delete_item(&kept.id).is_err());
        assert!(repository.attach_to_task(&kept.id, &task.id).is_err());
    }

    #[test]
    fn converting_item_into_completed_stage_recalculates_plan_order() {
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
                        title: "Completed first".to_string(),
                        description: "".to_string(),
                        position: 0,
                        tasks: vec![ImportTask {
                            title: "Done task".to_string(),
                            description: "".to_string(),
                            status: "done".to_string(),
                            checklist: vec![],
                            position: 0,
                        }],
                    },
                    ImportStage {
                        title: "Current second".to_string(),
                        description: "".to_string(),
                        position: 1,
                        tasks: vec![ImportTask {
                            title: "Todo task".to_string(),
                            description: "".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 0,
                        }],
                    },
                ],
            )
            .expect("replace plan");
        let completed_stage = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages")
            .into_iter()
            .find(|stage| stage.title == "Completed first")
            .expect("completed stage");
        let mut repository = InboxRepository::new(&mut conn);
        let item = repository
            .capture_item(&project.id, "Reopened work", "task_candidate")
            .expect("capture item");

        repository
            .convert_to_task(&item.id, &completed_stage.id)
            .expect("convert item");

        let stages = TaskRepository::new(&conn)
            .list_stages(&project.id)
            .expect("list stages");
        assert_eq!(stages[0].title, "Completed first");
        assert_eq!(stages[0].status, "current");
        assert_eq!(stages[1].title, "Current second");
        assert_eq!(stages[1].status, "future");
    }
}

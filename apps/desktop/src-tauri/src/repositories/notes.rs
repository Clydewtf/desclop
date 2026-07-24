use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::Note;

pub struct NoteRepository<'a> {
    conn: &'a Connection,
}

impl<'a> NoteRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn add_note(&self, project_id: &str, task_id: &str, body: &str) -> rusqlite::Result<Note> {
        self.conn.query_row(
            "select 1 from tasks where id = ?1 and project_id = ?2",
            params![task_id, project_id],
            |_| Ok(()),
        )?;

        let note = Note {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            task_id: Some(task_id.to_string()),
            body: body.to_string(),
            created_at: Utc::now().to_rfc3339(),
        };

        self.conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values (?1, ?2, ?3, ?4, ?5)",
            params![
                note.id,
                note.project_id,
                note.task_id,
                note.body,
                note.created_at
            ],
        )?;

        Ok(note)
    }

    pub fn list_notes_for_task(
        &self,
        project_id: &str,
        task_id: &str,
    ) -> rusqlite::Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "select notes.id, notes.project_id, notes.task_id, notes.body, notes.created_at
             from notes
             inner join tasks on tasks.id = notes.task_id
             where notes.project_id = ?1 and notes.task_id = ?2 and tasks.project_id = ?1
             order by notes.created_at desc, notes.id desc",
        )?;

        let rows = stmt.query_map(params![project_id, task_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        rows.collect()
    }

    pub fn list_notes_for_project(&self, project_id: &str) -> rusqlite::Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "select id, project_id, task_id, body, created_at
             from notes
             where project_id = ?1
             order by created_at desc, id desc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                project_id: row.get(1)?,
                task_id: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
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
    fn note_creation_listing_works_and_cross_project_task_insert_fails() {
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
        let repository = NoteRepository::new(&conn);

        let note = repository
            .add_note(&project.id, &task.id, "Migration is ready")
            .expect("add note");
        let notes = repository
            .list_notes_for_task(&project.id, &task.id)
            .expect("list notes");

        assert_eq!(note.body, "Migration is ready");
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, note.id);
        assert!(repository
            .add_note(&other_project.id, &task.id, "Wrong project")
            .is_err());
    }

    #[test]
    fn cross_project_note_listing_returns_no_rows() {
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
        let repository = NoteRepository::new(&conn);

        repository
            .add_note(&project.id, &task.id, "Migration is ready")
            .expect("add note");

        let project_notes = repository
            .list_notes_for_task(&project.id, &task.id)
            .expect("list project notes");
        let cross_project_notes = repository
            .list_notes_for_task(&other_project.id, &task.id)
            .expect("list cross-project notes");

        assert_eq!(project_notes.len(), 1);
        assert_eq!(cross_project_notes.len(), 0);
    }

    #[test]
    fn lists_all_notes_for_project_timeline() {
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
        let other_task = TaskRepository::new(&conn)
            .list_tasks(&other_project.id)
            .expect("list other tasks")
            .into_iter()
            .next()
            .expect("other task");
        let repository = NoteRepository::new(&conn);

        repository
            .add_note(&project.id, &task.id, "Project note")
            .expect("add note");
        repository
            .add_note(&other_project.id, &other_task.id, "Other note")
            .expect("add other note");

        let notes = repository
            .list_notes_for_project(&project.id)
            .expect("list project notes");

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].body, "Project note");
    }
}

use rusqlite::{params, Connection};

use crate::domain::{ChecklistItem, Stage, Task};

pub struct TaskRepository<'a> {
    conn: &'a Connection,
}

impl<'a> TaskRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn list_stages(&self, project_id: &str) -> rusqlite::Result<Vec<Stage>> {
        let mut stmt = self.conn.prepare(
            "select id, project_id, title, description, position, status
             from stages
             where project_id = ?1
             order by position asc, id asc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(Stage {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                position: row.get(4)?,
                status: row.get(5)?,
            })
        })?;

        rows.collect()
    }

    pub fn list_tasks(&self, project_id: &str) -> rusqlite::Result<Vec<Task>> {
        let mut stmt = self.conn.prepare(
            "select id, project_id, stage_id, title, description, status, priority, due_date, next_step, position
             from tasks
             where project_id = ?1
             order by stage_id asc, position asc, id asc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                stage_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                due_date: row.get(7)?,
                next_step: row.get(8)?,
                position: row.get(9)?,
            })
        })?;

        rows.collect()
    }

    pub fn list_checklist_items(&self, project_id: &str) -> rusqlite::Result<Vec<ChecklistItem>> {
        let mut stmt = self.conn.prepare(
            "select checklist_items.id, checklist_items.task_id, checklist_items.title, checklist_items.completed, checklist_items.position
             from checklist_items
             inner join tasks on tasks.id = checklist_items.task_id
             where tasks.project_id = ?1
             order by checklist_items.task_id asc, checklist_items.position asc, checklist_items.id asc",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(ChecklistItem {
                id: row.get(0)?,
                task_id: row.get(1)?,
                title: row.get(2)?,
                completed: row.get::<_, i32>(3)? == 1,
                position: row.get(4)?,
            })
        })?;

        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{ImportChecklistItem, ImportStage, ImportTask, PlanRepository};
    use crate::repositories::projects::ProjectRepository;

    #[test]
    fn lists_project_plan_rows_by_project() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");
        let other_project = ProjectRepository::new(&conn)
            .create_project("Other".to_string(), "/tmp/other".to_string(), false)
            .expect("create other project");

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
                            completed: false,
                            position: 0,
                        }],
                        position: 0,
                    }],
                }],
            )
            .expect("replace plan");
        PlanRepository::new(&mut conn)
            .replace_plan(
                &other_project.id,
                vec![ImportStage {
                    title: "Other stage".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Other task".to_string(),
                        status: "todo".to_string(),
                        checklist: vec![ImportChecklistItem {
                            title: "Other checklist item".to_string(),
                            completed: true,
                            position: 0,
                        }],
                        position: 0,
                    }],
                }],
            )
            .expect("replace other plan");

        let repository = TaskRepository::new(&conn);
        let stages = repository.list_stages(&project.id).expect("list stages");
        let tasks = repository.list_tasks(&project.id).expect("list tasks");
        let checklist_items = repository
            .list_checklist_items(&project.id)
            .expect("list checklist");

        assert_eq!(stages.len(), 1);
        assert_eq!(stages[0].title, "Foundation");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Create local store");
        assert_eq!(checklist_items.len(), 1);
        assert_eq!(checklist_items[0].title, "Add migration");
        assert!(!tasks.iter().any(|task| task.title == "Other task"));
        assert!(!checklist_items
            .iter()
            .any(|item| item.title == "Other checklist item"));

        let other_tasks = repository
            .list_tasks(&other_project.id)
            .expect("list other tasks");
        let other_checklist_items = repository
            .list_checklist_items(&other_project.id)
            .expect("list other checklist");

        assert_eq!(other_tasks.len(), 1);
        assert_eq!(other_tasks[0].title, "Other task");
        assert_eq!(other_checklist_items.len(), 1);
        assert_eq!(other_checklist_items[0].title, "Other checklist item");
    }
}

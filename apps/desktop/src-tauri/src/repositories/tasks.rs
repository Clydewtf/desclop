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

    pub fn update_task_status(&self, task_id: &str, status: &str) -> rusqlite::Result<()> {
        if status == "active" {
            let project_id: String = self.conn.query_row(
                "select project_id from tasks where id = ?1",
                rusqlite::params![task_id],
                |row| row.get(0),
            )?;
            return self.set_active_task(&project_id, task_id);
        }

        let updated_rows = self.conn.execute(
            "update tasks set status = ?1, updated_at = ?2 where id = ?3",
            rusqlite::params![status, chrono::Utc::now().to_rfc3339(), task_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.conn.execute(
            "update projects set active_task_id = null, updated_at = ?1 where active_task_id = ?2",
            rusqlite::params![chrono::Utc::now().to_rfc3339(), task_id],
        )?;
        Ok(())
    }

    pub fn set_active_task(&self, project_id: &str, task_id: &str) -> rusqlite::Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.query_row(
            "select tasks.id
             from tasks
             inner join projects on projects.id = tasks.project_id
             where tasks.id = ?1 and tasks.project_id = ?2 and tasks.status != 'done'",
            rusqlite::params![task_id, project_id],
            |_| Ok(()),
        )?;

        self.conn.execute(
            "update tasks
             set status = 'todo', updated_at = ?1
             where project_id = ?2 and id != ?3 and status = 'active'",
            rusqlite::params![now, project_id, task_id],
        )?;

        let updated_tasks = self.conn.execute(
            "update tasks
             set status = 'active', updated_at = ?1
             where id = ?2 and project_id = ?3 and status != 'done'",
            rusqlite::params![chrono::Utc::now().to_rfc3339(), task_id, project_id],
        )?;
        if updated_tasks == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }

        let updated_projects = self.conn.execute(
            "update projects set active_task_id = ?1, updated_at = ?2 where id = ?3",
            rusqlite::params![task_id, chrono::Utc::now().to_rfc3339(), project_id],
        )?;
        if updated_projects == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn update_checklist_item(&self, item_id: &str, completed: bool) -> rusqlite::Result<()> {
        let updated_rows = self.conn.execute(
            "update checklist_items set completed = ?1, updated_at = ?2 where id = ?3",
            rusqlite::params![completed as i32, chrono::Utc::now().to_rfc3339(), item_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn update_next_step(&self, task_id: &str, next_step: &str) -> rusqlite::Result<()> {
        let updated_rows = self.conn.execute(
            "update tasks set next_step = ?1, updated_at = ?2 where id = ?3",
            rusqlite::params![next_step, chrono::Utc::now().to_rfc3339(), task_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn move_commit_link(
        &self,
        commit_sha: &str,
        from_task_id: &str,
        to_task_id: &str,
    ) -> rusqlite::Result<()> {
        let updated_rows = self.conn.execute(
            "update commit_task_links
             set task_id = ?1, link_mode = 'manual'
             where commit_sha = ?2 and task_id = ?3",
            rusqlite::params![to_task_id, commit_sha, from_task_id],
        )?;
        if updated_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn unlink_commit(&self, commit_sha: &str, task_id: &str) -> rusqlite::Result<()> {
        let deleted_rows = self.conn.execute(
            "delete from commit_task_links where commit_sha = ?1 and task_id = ?2",
            rusqlite::params![commit_sha, task_id],
        )?;
        if deleted_rows == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{
        ImportChecklistItem, ImportStage, ImportTask, PlanRepository,
    };
    use crate::repositories::projects::ProjectRepository;

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
                    tasks: vec![
                        ImportTask {
                            title: "Create local store".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![ImportChecklistItem {
                                title: "Add migration".to_string(),
                                completed: false,
                                position: 0,
                            }],
                            position: 0,
                        },
                        ImportTask {
                            title: "Finished task".to_string(),
                            status: "done".to_string(),
                            checklist: vec![],
                            position: 1,
                        },
                    ],
                }],
            )
            .expect("replace plan");

        project
    }

    fn seed_commit_link(
        conn: &Connection,
        project_id: &str,
        task_id: &str,
        commit_sha: &str,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values (?1, ?2, 'main', 'Initial commit', 'Clyde', '2026-05-20T10:10:00Z', '[]')",
            rusqlite::params![commit_sha, project_id],
        )?;
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link-1', ?1, ?2, ?3, 'active_task', '2026-05-20T10:11:00Z')",
            rusqlite::params![project_id, task_id, commit_sha],
        )?;
        Ok(())
    }

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

    #[test]
    fn active_task_validates_project_task_and_status_invariants() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let other_project = seed_project_with_plan(&mut conn, "other");
        let repository = TaskRepository::new(&conn);
        let task = repository
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .find(|task| task.title == "Create local store")
            .expect("task");
        let done_task = repository
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .find(|task| task.title == "Finished task")
            .expect("done task");

        repository
            .set_active_task(&project.id, &task.id)
            .expect("set active task");

        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active task id");
        let status: String = conn
            .query_row(
                "select status from tasks where id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .expect("task status");

        assert_eq!(active_task_id, Some(task.id.clone()));
        assert_eq!(status, "active");
        assert!(repository
            .set_active_task(&other_project.id, &task.id)
            .is_err());
        assert!(repository
            .set_active_task(&project.id, &done_task.id)
            .is_err());
        assert!(repository
            .set_active_task(&project.id, "missing-task")
            .is_err());
    }

    #[test]
    fn changing_active_task_away_from_active_clears_project_active_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let repository = TaskRepository::new(&conn);
        let task = repository
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .find(|task| task.title == "Create local store")
            .expect("task");

        repository
            .update_task_status(&task.id, "active")
            .expect("set active");
        repository
            .update_task_status(&task.id, "blocked")
            .expect("set blocked");

        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active task id");
        let status: String = conn
            .query_row(
                "select status from tasks where id = ?1",
                params![task.id],
                |row| row.get(0),
            )
            .expect("task status");

        assert_eq!(active_task_id, None);
        assert_eq!(status, "blocked");
        assert!(repository
            .update_task_status("missing-task", "todo")
            .is_err());
    }

    #[test]
    fn checklist_and_next_step_stale_ids_return_errors() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let repository = TaskRepository::new(&conn);
        let checklist_item = repository
            .list_checklist_items(&project.id)
            .expect("list checklist")
            .into_iter()
            .find(|item| item.title == "Add migration")
            .expect("checklist item");
        let task = repository
            .list_tasks(&project.id)
            .expect("list tasks")
            .into_iter()
            .find(|task| task.title == "Create local store")
            .expect("task");

        repository
            .update_checklist_item(&checklist_item.id, true)
            .expect("update checklist");
        repository
            .update_next_step(&task.id, "Write repository tests")
            .expect("update next step");

        assert!(repository
            .update_checklist_item("missing-item", true)
            .is_err());
        assert!(repository
            .update_next_step("missing-task", "Stale update")
            .is_err());
    }

    #[test]
    fn moves_and_unlinks_commit_task_links() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let tasks = TaskRepository::new(&conn)
            .list_tasks(&project.id)
            .expect("list tasks");
        let from_task_id = &tasks[0].id;
        let to_task_id = &tasks[1].id;
        seed_commit_link(&conn, &project.id, from_task_id, "abc123").expect("seed commit link");
        let repository = TaskRepository::new(&conn);

        repository
            .move_commit_link("abc123", from_task_id, to_task_id)
            .expect("move commit link");

        let moved: (String, String) = conn
            .query_row(
                "select task_id, link_mode from commit_task_links where commit_sha = 'abc123'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("moved link");
        assert_eq!(moved, (to_task_id.clone(), "manual".to_string()));

        repository
            .unlink_commit("abc123", to_task_id)
            .expect("unlink commit");
        let link_count: i64 = conn
            .query_row("select count(*) from commit_task_links", [], |row| {
                row.get(0)
            })
            .expect("link count");
        assert_eq!(link_count, 0);
    }

    #[test]
    fn switching_active_task_demotes_previous_active_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = seed_project_with_plan(&mut conn, "desclop");
        let repository = TaskRepository::new(&conn);
        let tasks = repository.list_tasks(&project.id).expect("list tasks");
        let first_task = tasks
            .iter()
            .find(|task| task.title == "Create local store")
            .expect("first task");
        let second_task = tasks
            .iter()
            .find(|task| task.title == "Finished task")
            .expect("second task");
        repository
            .update_task_status(&second_task.id, "todo")
            .expect("make second task eligible");

        repository
            .set_active_task(&project.id, &first_task.id)
            .expect("set first active");
        repository
            .set_active_task(&project.id, &second_task.id)
            .expect("set second active");

        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active task id");
        let first_status: String = conn
            .query_row(
                "select status from tasks where id = ?1",
                params![first_task.id],
                |row| row.get(0),
            )
            .expect("first status");
        let second_status: String = conn
            .query_row(
                "select status from tasks where id = ?1",
                params![second_task.id],
                |row| row.get(0),
            )
            .expect("second status");
        let active_status_count: i64 = conn
            .query_row(
                "select count(*) from tasks where project_id = ?1 and status = 'active'",
                params![project.id],
                |row| row.get(0),
            )
            .expect("active status count");

        assert_eq!(active_task_id, Some(second_task.id.clone()));
        assert_eq!(first_status, "todo");
        assert_eq!(second_status, "active");
        assert_eq!(active_status_count, 1);
    }
}

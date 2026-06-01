use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::Project;

pub struct ProjectRepository<'a> {
    conn: &'a Connection,
}

impl<'a> ProjectRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create_project(
        &self,
        name: String,
        local_path: String,
        git_enabled: bool,
    ) -> rusqlite::Result<Project> {
        let now = Utc::now().to_rfc3339();
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name,
            local_path,
            git_enabled,
            git_remote: None,
            active_task_id: None,
            created_at: now.clone(),
            updated_at: now,
        };

        self.conn.execute(
            "insert into projects (id, name, local_path, git_enabled, git_remote, active_task_id, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                project.id,
                project.name,
                project.local_path,
                project.git_enabled as i32,
                project.git_remote,
                project.active_task_id,
                project.created_at,
                project.updated_at
            ],
        )?;

        Ok(project)
    }

    pub fn list_projects(&self) -> rusqlite::Result<Vec<Project>> {
        let mut stmt = self.conn.prepare(
            "select id, name, local_path, git_enabled, git_remote, active_task_id, created_at, updated_at
             from projects order by updated_at desc",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                local_path: row.get(2)?,
                git_enabled: row.get::<_, i32>(3)? == 1,
                git_remote: row.get(4)?,
                active_task_id: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        rows.collect()
    }

    pub fn get_project(&self, project_id: &str) -> rusqlite::Result<Project> {
        self.conn.query_row(
            "select id, name, local_path, git_enabled, git_remote, active_task_id, created_at, updated_at
             from projects where id = ?1",
            params![project_id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    local_path: row.get(2)?,
                    git_enabled: row.get::<_, i32>(3)? == 1,
                    git_remote: row.get(4)?,
                    active_task_id: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};

    #[test]
    fn create_and_list_project() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);

        let created = repo
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");

        let projects = repo.list_projects().expect("list projects");

        assert_eq!(created.name, "Desclop");
        assert_eq!(created.local_path, "/tmp/desclop");
        assert_eq!(created.git_enabled, false);
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, created.id);
    }

    #[test]
    fn get_project_returns_one_project_by_id() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);
        let created = repo
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), true)
            .expect("create project");

        let loaded = repo.get_project(&created.id).expect("load project");

        assert_eq!(loaded.id, created.id);
        assert_eq!(loaded.local_path, "/tmp/desclop");
        assert!(loaded.git_enabled);
        assert!(repo.get_project("missing-project").is_err());
    }
}

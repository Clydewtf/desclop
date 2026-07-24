use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{Project, ProjectSummary};

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

    pub fn list_project_summaries(&self) -> rusqlite::Result<Vec<ProjectSummary>> {
        let mut stmt = self.conn.prepare(
            "with task_counts as (
               select project_id, count(*) as task_count
               from tasks
               group by project_id
             ),
             open_inbox_counts as (
               select project_id, count(*) as open_inbox_count
               from inbox_items
               where status = 'open'
               group by project_id
             )
             select projects.id,
                    coalesce(task_counts.task_count, 0),
                    coalesce(open_inbox_counts.open_inbox_count, 0),
                    active_task.title
             from projects
             left join task_counts on task_counts.project_id = projects.id
             left join open_inbox_counts on open_inbox_counts.project_id = projects.id
             left join tasks active_task
               on active_task.project_id = projects.id
              and active_task.id = projects.active_task_id
             order by projects.updated_at desc",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ProjectSummary {
                project_id: row.get(0)?,
                task_count: row.get(1)?,
                open_inbox_count: row.get(2)?,
                active_task_title: row.get(3)?,
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

    pub fn delete_project(&self, project_id: &str) -> rusqlite::Result<()> {
        let deleted = self
            .conn
            .execute("delete from projects where id = ?1", params![project_id])?;
        if deleted == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use std::fs;

    fn insert_related_rows(conn: &Connection, project_id: &str, suffix: &str) {
        let stage_id = format!("stage-{suffix}");
        let task_id = format!("task-{suffix}");
        let commit_sha = format!("sha-{suffix}");

        conn.execute(
            "insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values (?1, ?2, 'Stage', 0, 'current', 'now', 'now')",
            params![stage_id, project_id],
        )
        .expect("insert stage");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, 'Task', 'todo', 0, 'now', 'now')",
            params![task_id, project_id, stage_id],
        )
        .expect("insert task");
        conn.execute(
            "insert into checklist_items (id, task_id, title, position, created_at, updated_at)
             values (?1, ?2, 'Check', 0, 'now', 'now')",
            params![format!("check-{suffix}"), task_id],
        )
        .expect("insert checklist item");
        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values (?1, ?2, ?3, 'Note', 'now')",
            params![format!("note-{suffix}"), project_id, task_id],
        )
        .expect("insert note");
        conn.execute(
            "insert into work_entries (id, project_id, task_id, source, done, created_at)
             values (?1, ?2, ?3, 'manual', 'Work', 'now')",
            params![format!("work-{suffix}"), project_id, task_id],
        )
        .expect("insert work entry");
        conn.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values (?1, ?2, ?3, 'Inbox', 'note', 'open', 'now', 'now')",
            params![format!("inbox-{suffix}"), project_id, task_id],
        )
        .expect("insert inbox item");
        conn.execute(
            "insert into commits (project_id, sha, branch, message, committed_at, changed_files_json)
             values (?1, ?2, 'main', 'Commit', 'now', '[]')",
            params![project_id, commit_sha],
        )
        .expect("insert commit");
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values (?1, ?2, ?3, ?4, 'manual', 'now')",
            params![
                format!("link-{suffix}"),
                project_id,
                task_id,
                commit_sha
            ],
        )
        .expect("insert commit task link");
        conn.execute(
            "insert into resume_briefs (id, project_id, task_id, stage_id, facts_json, generated_at)
             values (?1, ?2, ?3, ?4, '{}', 'now')",
            params![format!("resume-{suffix}"), project_id, task_id, stage_id],
        )
        .expect("insert resume brief");
    }

    fn count_rows(conn: &Connection, query: &str, project_id: &str) -> i64 {
        conn.query_row(query, params![project_id], |row| row.get(0))
            .expect("count rows")
    }

    fn assert_project_row_counts(conn: &Connection, project_id: &str, expected: i64) {
        let queries = [
            "select count(*) from stages where project_id = ?1",
            "select count(*) from tasks where project_id = ?1",
            "select count(*) from checklist_items where task_id in (select id from tasks where project_id = ?1)",
            "select count(*) from notes where project_id = ?1",
            "select count(*) from work_entries where project_id = ?1",
            "select count(*) from inbox_items where project_id = ?1",
            "select count(*) from commits where project_id = ?1",
            "select count(*) from commit_task_links where project_id = ?1",
            "select count(*) from resume_briefs where project_id = ?1",
        ];

        for query in queries {
            assert_eq!(count_rows(conn, query, project_id), expected, "{query}");
        }
    }

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
        assert!(!created.git_enabled);
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, created.id);
    }

    #[test]
    fn list_project_summaries_returns_counts_and_active_task_title() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);
        let project = repo
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");

        conn.execute(
            "insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values (?1, ?2, 'Current stage', 0, 'current', 'now', 'now')",
            params!["stage-1", project.id],
        )
        .expect("insert stage");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, 'now', 'now')",
            params![
                "task-active",
                project.id,
                "stage-1",
                "Delete project",
                "active",
                0
            ],
        )
        .expect("insert active task");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, 'now', 'now')",
            params![
                "task-done",
                project.id,
                "stage-1",
                "Finished task",
                "done",
                1
            ],
        )
        .expect("insert done task");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params!["task-active", project.id],
        )
        .expect("set active task");
        conn.execute(
            "insert into inbox_items (id, project_id, body, kind, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, 'now', 'now')",
            params!["inbox-open", project.id, "Open item", "note", "open"],
        )
        .expect("insert open inbox item");
        conn.execute(
            "insert into inbox_items (id, project_id, body, kind, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, 'now', 'now')",
            params![
                "inbox-deleted",
                project.id,
                "Deleted item",
                "note",
                "deleted"
            ],
        )
        .expect("insert deleted inbox item");

        let summaries = repo
            .list_project_summaries()
            .expect("list project summaries");

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].project_id, project.id);
        assert_eq!(summaries[0].task_count, 2);
        assert_eq!(summaries[0].open_inbox_count, 1);
        assert_eq!(
            summaries[0].active_task_title.as_deref(),
            Some("Delete project")
        );
    }

    #[test]
    fn list_project_summaries_isolates_projects_and_includes_empty_projects() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);
        let first = repo
            .create_project("First".to_string(), "/tmp/first".to_string(), false)
            .expect("create first project");
        let second = repo
            .create_project("Second".to_string(), "/tmp/second".to_string(), false)
            .expect("create second project");
        let empty = repo
            .create_project("Empty".to_string(), "/tmp/empty".to_string(), false)
            .expect("create empty project");

        conn.execute(
            "insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values (?1, ?2, 'First stage', 0, 'current', 'now', 'now')",
            params!["stage-first", first.id],
        )
        .expect("insert first stage");
        conn.execute(
            "insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values (?1, ?2, 'Second stage', 0, 'current', 'now', 'now')",
            params!["stage-second", second.id],
        )
        .expect("insert second stage");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, 'active', 0, 'now', 'now')",
            params![
                "task-first-active",
                first.id,
                "stage-first",
                "First active task"
            ],
        )
        .expect("insert first active task");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, 'done', 1, 'now', 'now')",
            params!["task-first-done", first.id, "stage-first", "First done task"],
        )
        .expect("insert first done task");
        conn.execute(
            "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, 'active', 0, 'now', 'now')",
            params![
                "task-second-active",
                second.id,
                "stage-second",
                "Second active task"
            ],
        )
        .expect("insert second active task");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params!["task-first-active", first.id],
        )
        .expect("set first active task");
        conn.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params!["task-second-active", second.id],
        )
        .expect("set second active task");

        for (id, project_id, status) in [
            ("inbox-first-open-1", first.id.as_str(), "open"),
            ("inbox-first-open-2", first.id.as_str(), "open"),
            ("inbox-first-deleted", first.id.as_str(), "deleted"),
            ("inbox-second-open", second.id.as_str(), "open"),
        ] {
            conn.execute(
                "insert into inbox_items (id, project_id, body, kind, status, created_at, updated_at)
                 values (?1, ?2, 'Inbox item', 'note', ?3, 'now', 'now')",
                params![id, project_id, status],
            )
            .expect("insert inbox item");
        }

        let summaries = repo
            .list_project_summaries()
            .expect("list project summaries");

        assert_eq!(summaries.len(), 3);

        let first_summary = summaries
            .iter()
            .find(|summary| summary.project_id == first.id)
            .expect("first project summary");
        assert_eq!(first_summary.task_count, 2);
        assert_eq!(first_summary.open_inbox_count, 2);
        assert_eq!(
            first_summary.active_task_title.as_deref(),
            Some("First active task")
        );

        let second_summary = summaries
            .iter()
            .find(|summary| summary.project_id == second.id)
            .expect("second project summary");
        assert_eq!(second_summary.task_count, 1);
        assert_eq!(second_summary.open_inbox_count, 1);
        assert_eq!(
            second_summary.active_task_title.as_deref(),
            Some("Second active task")
        );

        let empty_summary = summaries
            .iter()
            .find(|summary| summary.project_id == empty.id)
            .expect("empty project summary");
        assert_eq!(empty_summary.task_count, 0);
        assert_eq!(empty_summary.open_inbox_count, 0);
        assert_eq!(empty_summary.active_task_title, None);
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

    #[test]
    fn delete_project_cascades_related_rows_and_preserves_local_directory() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);
        let local_dir = std::env::temp_dir().join(format!("desclop-delete-{}", Uuid::new_v4()));
        let local_file = local_dir.join("keep.txt");
        fs::create_dir_all(&local_dir).expect("create local project directory");
        fs::write(&local_file, "keep me").expect("write local project file");

        let deleted = repo
            .create_project(
                "Deleted".to_string(),
                local_dir.to_string_lossy().into_owned(),
                true,
            )
            .expect("create deleted project");
        let preserved = repo
            .create_project("Preserved".to_string(), "/tmp/preserved".to_string(), false)
            .expect("create preserved project");
        insert_related_rows(&conn, &deleted.id, "deleted");
        insert_related_rows(&conn, &preserved.id, "preserved");

        repo.delete_project(&deleted.id).expect("delete project");

        assert!(repo.get_project(&deleted.id).is_err());
        assert_eq!(
            repo.get_project(&preserved.id)
                .expect("preserved project")
                .id,
            preserved.id
        );
        assert_project_row_counts(&conn, &deleted.id, 0);
        assert_project_row_counts(&conn, &preserved.id, 1);
        assert_eq!(
            count_rows(
                &conn,
                "select count(*) from checklist_items where id = ?1",
                "check-deleted",
            ),
            0
        );
        assert_eq!(
            count_rows(
                &conn,
                "select count(*) from checklist_items where id = ?1",
                "check-preserved",
            ),
            1
        );
        assert!(local_dir.is_dir());
        assert_eq!(
            fs::read_to_string(&local_file).expect("read local file"),
            "keep me"
        );

        fs::remove_dir_all(&local_dir).expect("clean local project directory");
        assert!(!local_dir.exists());
    }

    #[test]
    fn delete_project_returns_error_for_missing_project() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repo = ProjectRepository::new(&conn);

        let error = repo
            .delete_project("missing-project")
            .expect_err("missing project should fail");

        assert!(matches!(error, rusqlite::Error::QueryReturnedNoRows));
    }
}

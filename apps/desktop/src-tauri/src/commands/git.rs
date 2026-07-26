use tauri::State;

use crate::app_state::AppState;
use crate::domain::GitCommit;
use crate::repositories::projects::ProjectRepository;
use crate::repositories::tasks::TaskRepository;
use crate::services::commit_linker::{
    list_linked_commits_for_task as list_linked_commits_for_task_rows, sync_commits,
};
use crate::services::git_adapter::{read_current_branch, read_recent_commits, GitCommitMetadata};
use rusqlite::{params, Connection, OptionalExtension};

#[tauri::command]
pub fn read_git_commits(local_path: String) -> Result<Vec<GitCommitMetadata>, String> {
    read_recent_commits(&local_path, 25)
}

#[tauri::command]
pub fn read_current_git_branch(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let local_path = {
        let conn = state.connection()?;
        project_git_path_for_sync(&conn, &project_id).map_err(|err| err.to_string())?
    };

    match local_path {
        Some(path) => read_current_branch(&path).map(Some),
        None => Ok(None),
    }
}

fn project_git_path_for_sync(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<Option<String>> {
    let project = ProjectRepository::new(conn).get_project(project_id)?;

    if project.git_enabled {
        Ok(Some(project.local_path))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn sync_git_commits(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommit>, String> {
    sync_git_commits_for_project(&project_id, &state, read_recent_commits)
}

pub(crate) fn sync_git_commits_for_project(
    project_id: &str,
    state: &AppState,
    read_commits: impl FnOnce(&str, usize) -> Result<Vec<GitCommitMetadata>, String>,
) -> Result<Vec<GitCommit>, String> {
    let local_path = {
        let conn = state.connection()?;
        project_git_path_for_sync(&conn, project_id).map_err(|err| err.to_string())?
    };

    let Some(local_path) = local_path else {
        return Ok(Vec::new());
    };

    let commits = read_commits(&local_path, 25)?;
    let conn = state.connection()?;
    sync_commits(&conn, project_id, commits).map_err(|err| err.to_string())
}

pub(crate) fn sync_active_task_commits_before_completion(
    task_id: &str,
    state: &AppState,
    read_commits: impl FnOnce(&str, usize) -> Result<Vec<GitCommitMetadata>, String>,
) -> Result<Vec<GitCommit>, String> {
    let active_project_id: Option<String> = {
        let conn = state.connection()?;
        conn.query_row(
            "select projects.id
             from projects
             inner join tasks on tasks.project_id = projects.id
             where tasks.id = ?1 and projects.active_task_id = tasks.id",
            params![task_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    };

    let Some(project_id) = active_project_id else {
        return Ok(Vec::new());
    };

    sync_git_commits_for_project(&project_id, state, read_commits)
}

#[tauri::command]
pub fn list_linked_commits_for_task(
    project_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommit>, String> {
    let conn = state.connection()?;
    list_linked_commits_for_task_rows(&conn, &project_id, &task_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn move_commit_link(
    commit_sha: String,
    from_task_id: String,
    to_task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .move_commit_link(&commit_sha, &from_task_id, &to_task_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn unlink_commit(
    commit_sha: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .unlink_commit(&commit_sha, &task_id)
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{ImportStage, ImportTask, PlanRepository};

    #[test]
    fn project_git_path_for_sync_returns_none_when_git_is_disabled() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project(
                "Desclop".to_string(),
                "/tmp/not-a-git-repository".to_string(),
                false,
            )
            .expect("create project");

        let path = project_git_path_for_sync(&conn, &project.id).expect("sync path");

        assert_eq!(path, None);
    }

    #[test]
    fn project_git_path_for_sync_returns_local_path_when_git_is_enabled() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), true)
            .expect("create project");

        let path = project_git_path_for_sync(&conn, &project.id).expect("sync path");

        assert_eq!(path, Some("/tmp/desclop".to_string()));
    }

    #[test]
    fn sync_git_commits_returns_empty_for_disabled_git_without_reading_repo() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project(
                "Desclop".to_string(),
                "/tmp/not-a-git-repository".to_string(),
                false,
            )
            .expect("create project");
        let state = AppState::from_connection_for_tests(conn);

        let commits = sync_git_commits_for_project(&project.id, &state, |_path, _limit| {
            panic!("git reader should not run for a project with git disabled");
        })
        .expect("sync commits");

        assert!(commits.is_empty());
    }

    #[test]
    fn syncs_and_links_commits_before_an_active_task_is_completed() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), true)
            .expect("create project");
        PlanRepository::new(&mut conn)
            .import_plan(
                &project.id,
                "Main plan",
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: String::new(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Current task".to_string(),
                        description: String::new(),
                        status: "todo".to_string(),
                        checklist: vec![],
                        position: 0,
                    }],
                }],
            )
            .expect("import plan");
        let task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("task id");
        TaskRepository::new(&conn)
            .set_active_task(&project.id, &task_id)
            .expect("set active task");
        let state = AppState::from_connection_for_tests(conn);

        let commits =
            sync_active_task_commits_before_completion(&task_id, &state, |path, limit| {
                assert_eq!(path, "/tmp/desclop");
                assert_eq!(limit, 25);
                Ok(vec![GitCommitMetadata {
                    sha: "abc123".to_string(),
                    branch: "main".to_string(),
                    message: "Finish task".to_string(),
                    author_name: "Clyde".to_string(),
                    committed_at: "2026-07-27T00:00:00Z".to_string(),
                    changed_files: vec!["src/main.rs".to_string()],
                }])
            })
            .expect("sync commits");

        assert_eq!(commits.len(), 1);
        let conn = state.connection().expect("connection");
        let linked = list_linked_commits_for_task_rows(&conn, &project.id, &task_id)
            .expect("linked commits");
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].sha, "abc123");
    }
}

use tauri::State;

use crate::app_state::AppState;
use crate::domain::GitCommit;
use crate::repositories::projects::ProjectRepository;
use crate::repositories::tasks::TaskRepository;
use crate::services::commit_linker::{
    list_linked_commits_for_task as list_linked_commits_for_task_rows, sync_commits,
};
use crate::services::git_adapter::{read_recent_commits, GitCommitMetadata};
use rusqlite::Connection;

#[tauri::command]
pub fn read_git_commits(local_path: String) -> Result<Vec<GitCommitMetadata>, String> {
    read_recent_commits(&local_path, 25)
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

fn sync_git_commits_for_project(
    project_id: &str,
    state: &AppState,
    read_commits: impl FnOnce(&str, usize) -> Result<Vec<GitCommitMetadata>, String>,
) -> Result<Vec<GitCommit>, String> {
    let local_path = {
        let conn = state.conn.lock().map_err(|err| err.to_string())?;
        project_git_path_for_sync(&conn, project_id).map_err(|err| err.to_string())?
    };

    let Some(local_path) = local_path else {
        return Ok(Vec::new());
    };

    let commits = read_commits(&local_path, 25)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    sync_commits(&conn, project_id, commits).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_linked_commits_for_task(
    project_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommit>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    list_linked_commits_for_task_rows(&conn, &project_id, &task_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn move_commit_link(
    commit_sha: String,
    from_task_id: String,
    to_task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
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
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    TaskRepository::new(&conn)
        .unlink_commit(&commit_sha, &task_id)
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use crate::db::{create_memory_connection, run_migrations};
    use std::sync::Mutex;

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
        let state = AppState {
            conn: Mutex::new(conn),
        };

        let commits = sync_git_commits_for_project(&project.id, &state, |_path, _limit| {
            panic!("git reader should not run for a project with git disabled");
        })
        .expect("sync commits");

        assert!(commits.is_empty());
    }
}

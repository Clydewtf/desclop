use tauri::State;

use crate::app_state::AppState;
use crate::domain::GitCommit;
use crate::repositories::tasks::TaskRepository;
use crate::services::commit_linker::{
    list_linked_commits_for_task as list_linked_commits_for_task_rows, sync_commits,
};
use crate::services::git_adapter::{read_recent_commits, GitCommitMetadata};

#[tauri::command]
pub fn read_git_commits(local_path: String) -> Result<Vec<GitCommitMetadata>, String> {
    read_recent_commits(&local_path, 25)
}

#[tauri::command]
pub fn sync_git_commits(
    project_id: String,
    local_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitCommit>, String> {
    let commits = read_recent_commits(&local_path, 25)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    sync_commits(&conn, &project_id, commits).map_err(|err| err.to_string())
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

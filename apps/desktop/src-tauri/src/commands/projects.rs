use tauri::State;

use crate::app_state::AppState;
use crate::domain::{CreateProjectInput, Project, ProjectSummary};
use crate::repositories::projects::ProjectRepository;

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .list_projects()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_project_summaries(state: State<'_, AppState>) -> Result<Vec<ProjectSummary>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .list_project_summaries()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    if input.name.trim().is_empty() {
        return Err("Project name is required".to_string());
    }
    if input.local_path.trim().is_empty() {
        return Err("Project folder is required".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .create_project(input.name, input.local_path, input.git_enabled)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .delete_project(&project_id)
        .map_err(|err| err.to_string())
}

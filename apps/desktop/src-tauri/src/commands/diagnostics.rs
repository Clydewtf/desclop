use tauri::State;

use crate::app_state::{AppState, DatabaseRuntimeStatus};
use crate::services::diagnostics::{collect_project_diagnostics, ProjectDiagnostics};

#[tauri::command]
pub fn get_database_status(state: State<'_, AppState>) -> DatabaseRuntimeStatus {
    state.database_status()
}

#[tauri::command]
pub fn get_project_diagnostics(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ProjectDiagnostics, String> {
    collect_project_diagnostics(&state, &project_id)
}

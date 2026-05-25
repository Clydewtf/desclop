use tauri::State;

use crate::app_state::AppState;
use crate::domain::ResumeBrief;
use crate::services::resume::build_resume_brief;

#[tauri::command]
pub fn get_resume_brief(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ResumeBrief, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    build_resume_brief(&conn, &project_id).map_err(|err| err.to_string())
}

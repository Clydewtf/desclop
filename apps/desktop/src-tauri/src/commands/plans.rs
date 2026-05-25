use tauri::State;

use crate::app_state::AppState;
use crate::repositories::plans::{ImportStage, PlanRepository};

#[tauri::command]
pub fn import_plan(
    project_id: String,
    stages: Vec<ImportStage>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if stages.is_empty() {
        return Err("Import requires at least one stage".to_string());
    }

    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    PlanRepository::new(&mut conn)
        .replace_plan(&project_id, stages)
        .map_err(|err| err.to_string())
}

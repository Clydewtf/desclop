use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::domain::{ChecklistItem, Stage, Task};
use crate::repositories::tasks::TaskRepository;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPlanPayload {
    pub stages: Vec<Stage>,
    pub tasks: Vec<Task>,
    pub checklist_items: Vec<ChecklistItem>,
}

#[tauri::command]
pub fn load_project_plan(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ProjectPlanPayload, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let repository = TaskRepository::new(&conn);

    Ok(ProjectPlanPayload {
        stages: repository
            .list_stages(&project_id)
            .map_err(|err| err.to_string())?,
        tasks: repository
            .list_tasks(&project_id)
            .map_err(|err| err.to_string())?,
        checklist_items: repository
            .list_checklist_items(&project_id)
            .map_err(|err| err.to_string())?,
    })
}

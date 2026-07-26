use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::commands::git::sync_active_task_commits_before_completion;
use crate::domain::{ChecklistItem, Plan, Stage, Task};
use crate::repositories::tasks::TaskRepository;
use crate::services::git_adapter::read_recent_commits;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPlanPayload {
    pub plans: Vec<Plan>,
    pub stages: Vec<Stage>,
    pub tasks: Vec<Task>,
    pub checklist_items: Vec<ChecklistItem>,
}

#[tauri::command]
pub fn load_project_plan(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<ProjectPlanPayload, String> {
    let conn = state.connection()?;
    let repository = TaskRepository::new(&conn);

    Ok(ProjectPlanPayload {
        plans: repository
            .list_plans(&project_id)
            .map_err(|err| err.to_string())?,
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

#[tauri::command]
pub fn update_task_status(
    task_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if status == "done" {
        // The active task is cleared by the status update below. Discover and
        // persist any new local Git links first, while the task is still the
        // automatic link target. Git availability never blocks task work.
        let _ = sync_active_task_commits_before_completion(&task_id, &state, read_recent_commits);
    }
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .update_task_status(&task_id, &status)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_active_task(
    project_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .set_active_task(&project_id, &task_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_checklist_item(
    item_id: String,
    completed: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .update_checklist_item(&item_id, completed)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_next_step(
    task_id: String,
    next_step: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.connection()?;
    TaskRepository::new(&conn)
        .update_next_step(&task_id, &next_step)
        .map_err(|err| err.to_string())
}

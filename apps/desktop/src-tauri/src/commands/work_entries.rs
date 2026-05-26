use tauri::State;

use crate::app_state::AppState;
use crate::domain::{CreateWorkEntryInput, WorkEntry};
use crate::repositories::work_entries::WorkEntryRepository;

#[tauri::command]
pub fn create_work_entry(
    input: CreateWorkEntryInput,
    state: State<'_, AppState>,
) -> Result<WorkEntry, String> {
    if input.done.trim().is_empty()
        && input.remains.trim().is_empty()
        && input.next_step.trim().is_empty()
    {
        return Err("Work review needs at least one field".to_string());
    }

    let input = CreateWorkEntryInput {
        done: input.done.trim().to_string(),
        remains: input.remains.trim().to_string(),
        next_step: input.next_step.trim().to_string(),
        ..input
    };

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    WorkEntryRepository::new(&conn)
        .create_work_entry(input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_work_entries_for_task(
    project_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<WorkEntry>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    WorkEntryRepository::new(&conn)
        .list_work_entries_for_task(&project_id, &task_id)
        .map_err(|err| err.to_string())
}

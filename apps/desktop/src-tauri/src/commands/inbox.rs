use tauri::State;

use crate::app_state::AppState;
use crate::domain::{
    AttachInboxItemInput, CaptureInboxItemInput, ConvertInboxItemInput, InboxItem, Note, Task,
};
use crate::repositories::inbox::InboxRepository;

#[tauri::command]
pub fn capture_inbox_item(
    input: CaptureInboxItemInput,
    state: State<'_, AppState>,
) -> Result<InboxItem, String> {
    if input.body.trim().is_empty() {
        return Err("Inbox capture body is required".to_string());
    }

    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    InboxRepository::new(&mut conn)
        .capture_item(&input.project_id, input.body.trim(), &input.kind)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn attach_inbox_item_to_task(
    input: AttachInboxItemInput,
    state: State<'_, AppState>,
) -> Result<InboxItem, String> {
    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    InboxRepository::new(&mut conn)
        .attach_to_task(&input.item_id, &input.task_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn convert_inbox_item_to_task(
    input: ConvertInboxItemInput,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    InboxRepository::new(&mut conn)
        .convert_to_task(&input.item_id, &input.stage_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn keep_inbox_item_as_note(
    item_id: String,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    InboxRepository::new(&mut conn)
        .keep_as_note(&item_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_inbox_item(item_id: String, state: State<'_, AppState>) -> Result<InboxItem, String> {
    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    InboxRepository::new(&mut conn)
        .delete_item(&item_id)
        .map_err(|err| err.to_string())
}

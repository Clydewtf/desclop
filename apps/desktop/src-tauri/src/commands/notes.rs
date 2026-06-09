use tauri::State;

use crate::app_state::AppState;
use crate::domain::Note;
use crate::repositories::notes::NoteRepository;

#[tauri::command]
pub fn add_note(
    project_id: String,
    task_id: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<Note, String> {
    let trimmed_body = body.trim();
    if trimmed_body.is_empty() {
        return Err("Note body is required".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    NoteRepository::new(&conn)
        .add_note(&project_id, &task_id, trimmed_body)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_notes_for_project(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    NoteRepository::new(&conn)
        .list_notes_for_project(&project_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_notes_for_task(
    project_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    NoteRepository::new(&conn)
        .list_notes_for_task(&project_id, &task_id)
        .map_err(|err| err.to_string())
}

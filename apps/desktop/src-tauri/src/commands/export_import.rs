use tauri::State;

use crate::app_state::AppState;
use crate::services::portable_bundle::{
    export_project_bundle_to_folder, import_project_bundle_from_folder,
};

#[tauri::command]
pub fn export_project_bundle(
    project_id: String,
    destination_folder: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if destination_folder.trim().is_empty() {
        return Err("Destination folder is required".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    export_project_bundle_to_folder(&conn, &project_id, destination_folder)
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_project_bundle(
    bundle_folder: String,
    reselected_local_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if bundle_folder.trim().is_empty() {
        return Err("Bundle folder is required".to_string());
    }

    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    import_project_bundle_from_folder(&mut conn, bundle_folder, &reselected_local_path)
}

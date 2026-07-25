use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::commands::projects::validate_local_project_folder;
use crate::repositories::projects::ProjectRepository;
use crate::services::backup_store::record_portable_backup;
use crate::services::portable_bundle::{
    build_project_bundle, import_project_bundle as import_project_bundle_rows,
    inspect_project_bundle_from_path, read_project_bundle_from_path,
    write_project_bundle_to_folder, PortableBundlePreview,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableBackupExportResult {
    pub path: String,
    pub exported_at: String,
    pub format_version: u32,
    pub backup_recorded: bool,
}

#[tauri::command]
pub fn export_project_bundle(
    project_id: String,
    destination_folder: String,
    state: State<'_, AppState>,
) -> Result<PortableBackupExportResult, String> {
    if destination_folder.trim().is_empty() {
        return Err("Destination folder is required".to_string());
    }

    let bundle = {
        let conn = state.connection()?;
        build_project_bundle(&conn, &project_id)?
    };
    let bundle_path = write_project_bundle_to_folder(&bundle, destination_folder)?;
    let backup_recorded = record_portable_backup(
        state.backups_dir(),
        &bundle_path,
        bundle.exported_at.clone(),
        bundle.format_version,
    )
    .is_ok();
    // Export is a deliberate project action, so it also moves the source project
    // to the top of the locally sorted project picker. The backup file already
    // exists if this metadata update ever fails, therefore do not misreport it.
    if let Ok(conn) = state.connection() {
        let _ = ProjectRepository::new(&conn).touch_project(&project_id);
    }

    Ok(PortableBackupExportResult {
        path: bundle_path.to_string_lossy().to_string(),
        exported_at: bundle.exported_at,
        format_version: bundle.format_version,
        backup_recorded,
    })
}

#[tauri::command]
pub fn inspect_project_bundle(bundle_folder: String) -> Result<PortableBundlePreview, String> {
    if bundle_folder.trim().is_empty() {
        return Err("Backup file is required".to_string());
    }

    inspect_project_bundle_from_path(bundle_folder)
}

#[tauri::command]
pub fn import_project_bundle(
    bundle_folder: String,
    reselected_local_path: String,
    confirmed: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if bundle_folder.trim().is_empty() {
        return Err("Backup file is required".to_string());
    }
    if !confirmed {
        return Err("Review the backup and confirm restore before importing".to_string());
    }

    let local_path = validate_local_project_folder(&reselected_local_path)?;
    let bundle = read_project_bundle_from_path(&bundle_folder)?;
    let mut conn = state.connection()?;
    import_project_bundle_rows(
        &mut conn,
        bundle,
        &local_path.to_string_lossy(),
        bundle_folder,
    )
}

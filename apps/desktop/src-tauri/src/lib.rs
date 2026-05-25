mod app_state;
mod commands;
mod db;
mod domain;
mod errors;
mod repositories;

use app_state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            app.manage(AppState::new(app_data_dir)?);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::plans::import_plan,
            commands::tasks::load_project_plan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

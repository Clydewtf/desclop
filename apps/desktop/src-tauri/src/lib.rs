mod app_state;
mod commands;
mod db;
mod domain;
mod repositories;
mod services;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::list_project_summaries,
            commands::projects::create_project,
            commands::projects::delete_project,
            commands::plans::import_plan,
            commands::tasks::load_project_plan,
            commands::tasks::update_task_status,
            commands::tasks::set_active_task,
            commands::tasks::update_checklist_item,
            commands::tasks::update_next_step,
            commands::inbox::list_inbox_items_for_project,
            commands::inbox::list_inbox_items_for_task,
            commands::inbox::capture_inbox_item,
            commands::inbox::attach_inbox_item_to_task,
            commands::inbox::convert_inbox_item_to_task,
            commands::inbox::keep_inbox_item_as_note,
            commands::inbox::delete_inbox_item,
            commands::notes::add_note,
            commands::notes::list_notes_for_project,
            commands::notes::list_notes_for_task,
            commands::work_entries::create_work_entry,
            commands::work_entries::list_work_entries_for_project,
            commands::work_entries::list_work_entries_for_task,
            commands::resume::get_resume_brief,
            commands::entitlements::get_entitlement,
            commands::entitlements::set_entitlement,
            commands::git::read_git_commits,
            commands::git::sync_git_commits,
            commands::git::list_linked_commits_for_task,
            commands::git::move_commit_link,
            commands::git::unlink_commit,
            commands::export_import::export_project_bundle,
            commands::export_import::import_project_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

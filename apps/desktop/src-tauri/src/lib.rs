mod app_state;
mod commands;
mod db;
mod domain;
mod repositories;
mod services;

use app_state::AppState;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const QUICK_CAPTURE_OPEN_EVENT: &str = "quick-capture:open";

fn quick_capture_shortcuts() -> [Shortcut; 2] {
    [
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyC),
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyC),
    ]
}

fn open_quick_capture(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let _ = app.emit(QUICK_CAPTURE_OPEN_EVENT, ());
}

fn register_quick_capture_shortcuts(app: &tauri::AppHandle) {
    for shortcut in quick_capture_shortcuts() {
        if let Err(error) = app.global_shortcut().register(shortcut) {
            eprintln!("Could not register Quick Capture shortcut: {error}");
        }
    }
}

fn is_quick_capture_shortcut(shortcut: &Shortcut) -> bool {
    quick_capture_shortcuts()
        .iter()
        .any(|quick_capture_shortcut| quick_capture_shortcut == shortcut)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && is_quick_capture_shortcut(shortcut)
                    {
                        open_quick_capture(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            app.manage(AppState::new(app_data_dir)?);
            register_quick_capture_shortcuts(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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

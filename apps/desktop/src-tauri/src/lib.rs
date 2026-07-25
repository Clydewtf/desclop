mod app_state;
mod commands;
mod db;
mod domain;
mod repositories;
mod services;

use app_state::{AppState, CloseBehavior, DesktopRuntimeState};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_window_state::StateFlags;

const QUICK_CAPTURE_OPEN_EVENT: &str = "quick-capture:open";
const TRAY_SHOW_ID: &str = "show_desclop";
const TRAY_QUIT_ID: &str = "quit_desclop";
const DEFAULT_CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+C";

fn default_capture_shortcut() -> Shortcut {
    DEFAULT_CAPTURE_SHORTCUT
        .parse()
        .expect("default Capture shortcut should be valid")
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_quick_capture(app: &tauri::AppHandle) {
    show_main_window(app);
    let _ = app.emit(QUICK_CAPTURE_OPEN_EVENT, ());
}

fn register_default_capture_shortcut(app: &tauri::AppHandle) {
    let shortcut = default_capture_shortcut();
    if let Err(error) = app.global_shortcut().register(shortcut) {
        eprintln!("Could not register Capture shortcut: {error}");
        return;
    }

    if let Ok(mut active_shortcut) = app.state::<DesktopRuntimeState>().capture_shortcut.lock() {
        *active_shortcut = Some(shortcut);
    }
}

fn is_active_capture_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut) -> bool {
    app.state::<DesktopRuntimeState>()
        .capture_shortcut
        .lock()
        .map(|active_shortcut| active_shortcut.as_ref() == Some(shortcut))
        .unwrap_or(false)
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, TRAY_SHOW_ID, "Show Desclop", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit Desclop", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Desclop")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_ID => show_main_window(app),
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && is_active_capture_shortcut(app, shortcut)
                    {
                        open_quick_capture(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            app.manage(AppState::new(app_data_dir)?);
            app.manage(DesktopRuntimeState::default());
            register_default_capture_shortcut(app.handle());
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let close_behavior = window
                        .app_handle()
                        .state::<DesktopRuntimeState>()
                        .close_behavior
                        .lock()
                        .map(|behavior| *behavior)
                        .unwrap_or(CloseBehavior::Tray);

                    match close_behavior {
                        CloseBehavior::Tray => {
                            let _ = window.hide();
                        }
                        CloseBehavior::Quit => window.app_handle().exit(0),
                    }
                }
            }
        })
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::list_project_summaries,
            commands::projects::inspect_project_folder,
            commands::projects::create_project,
            commands::projects::delete_project,
            commands::projects::relink_project_folder,
            commands::diagnostics::get_database_status,
            commands::diagnostics::get_project_diagnostics,
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
            commands::settings::set_close_behavior,
            commands::settings::set_capture_shortcut,
            commands::settings::quit_app,
            commands::git::read_git_commits,
            commands::git::read_current_git_branch,
            commands::git::sync_git_commits,
            commands::git::list_linked_commits_for_task,
            commands::git::move_commit_link,
            commands::git::unlink_commit,
            commands::export_import::export_project_bundle,
            commands::export_import::inspect_project_bundle,
            commands::export_import::import_project_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

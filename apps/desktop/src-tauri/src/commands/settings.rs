use std::str::FromStr;

use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::app_state::{CloseBehavior, DesktopRuntimeState};

#[tauri::command]
pub fn set_close_behavior(
    behavior: String,
    state: State<'_, DesktopRuntimeState>,
) -> Result<(), String> {
    let next_behavior = match behavior.trim().to_ascii_lowercase().as_str() {
        "tray" => CloseBehavior::Tray,
        "quit" => CloseBehavior::Quit,
        _ => return Err("Unsupported close behavior.".to_string()),
    };

    let mut current_behavior = state
        .close_behavior
        .lock()
        .map_err(|error| error.to_string())?;
    *current_behavior = next_behavior;
    Ok(())
}

#[tauri::command]
pub fn set_capture_shortcut(
    app: AppHandle,
    shortcut: String,
    state: State<'_, DesktopRuntimeState>,
) -> Result<(), String> {
    let next_shortcut = Shortcut::from_str(shortcut.trim())
        .map_err(|error| format!("Could not parse Capture shortcut: {error}"))?;
    let previous_shortcut = state
        .capture_shortcut
        .lock()
        .map_err(|error| error.to_string())?
        .to_owned();

    if previous_shortcut == Some(next_shortcut) {
        return Ok(());
    }

    app.global_shortcut()
        .register(next_shortcut)
        .map_err(|error| format!("Could not register Capture shortcut: {error}"))?;

    if let Some(previous_shortcut) = previous_shortcut {
        if let Err(error) = app.global_shortcut().unregister(previous_shortcut) {
            let _ = app.global_shortcut().unregister(next_shortcut);
            return Err(format!("Could not replace Capture shortcut: {error}"));
        }
    }

    let mut active_shortcut = state
        .capture_shortcut
        .lock()
        .map_err(|error| error.to_string())?;
    *active_shortcut = Some(next_shortcut);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

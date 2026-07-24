use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri_plugin_global_shortcut::Shortcut;

use crate::db::{open_connection, run_migrations};

pub struct AppState {
    pub conn: Mutex<Connection>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloseBehavior {
    Tray,
    Quit,
}

pub struct DesktopRuntimeState {
    pub close_behavior: Mutex<CloseBehavior>,
    pub capture_shortcut: Mutex<Option<Shortcut>>,
}

impl Default for DesktopRuntimeState {
    fn default() -> Self {
        Self {
            close_behavior: Mutex::new(CloseBehavior::Tray),
            capture_shortcut: Mutex::new(None),
        }
    }
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir).map_err(|err| err.to_string())?;
        let db_path = app_data_dir.join("desclop.sqlite3");
        let conn = open_connection(&db_path).map_err(|err| err.to_string())?;
        run_migrations(&conn).map_err(|err| err.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use serde::Serialize;
use tauri_plugin_global_shortcut::Shortcut;

use crate::db::{
    database_integrity_is_ok, migrations_are_pending, open_connection, run_migrations,
    schema_version, CURRENT_SCHEMA_VERSION,
};
use crate::services::backup_store::{
    backup_directory, create_pre_migration_snapshot, read_last_backup, BackupRecord,
};

const RECOVERY_REQUIRED_PREFIX: &str = "DATABASE_RECOVERY_REQUIRED";

pub struct AppState {
    database: DatabaseAccess,
    backups_dir: PathBuf,
}

enum DatabaseAccess {
    Ready(Mutex<Connection>),
    Recovery(DatabaseRuntimeStatus),
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRuntimeStatus {
    pub state: String,
    pub schema_version: Option<i64>,
    pub target_schema_version: i64,
    pub integrity: String,
    pub recovery_code: Option<String>,
    pub recovery_backup_path: Option<String>,
    pub next_step: Option<String>,
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
        let database_path = app_data_dir.join("desclop.sqlite3");
        let backups_dir = backup_directory(&app_data_dir);
        let database_existed = database_path.exists();

        let database = match open_connection(&database_path) {
            Ok(conn) => initialize_database(conn, &backups_dir, database_existed),
            Err(_) => DatabaseAccess::Recovery(recovery_status(
                "database_open_failed",
                None,
                None,
                "Desclop did not open or replace this database. Quit the app, make a copy of desclop.sqlite3, then restore a known SQLite snapshot before reopening.",
            )),
        };

        Ok(Self {
            database,
            backups_dir,
        })
    }

    pub fn connection(&self) -> Result<MutexGuard<'_, Connection>, String> {
        match &self.database {
            DatabaseAccess::Ready(conn) => conn.lock().map_err(|err| err.to_string()),
            DatabaseAccess::Recovery(status) => Err(format!(
                "{RECOVERY_REQUIRED_PREFIX}:{}",
                status.recovery_code.as_deref().unwrap_or("unknown")
            )),
        }
    }

    pub fn database_status(&self) -> DatabaseRuntimeStatus {
        match &self.database {
            DatabaseAccess::Ready(conn) => match conn.lock() {
                Ok(conn) => ready_status(&conn),
                Err(_) => recovery_status(
                    "database_lock_failed",
                    None,
                    None,
                    "Quit and reopen Desclop. The existing database has not been replaced.",
                ),
            },
            DatabaseAccess::Recovery(status) => status.clone(),
        }
    }

    pub fn backups_dir(&self) -> &Path {
        &self.backups_dir
    }

    #[cfg(test)]
    pub fn from_connection_for_tests(conn: Connection) -> Self {
        let app_data_dir =
            std::env::temp_dir().join(format!("desclop-app-state-test-{}", uuid::Uuid::new_v4()));
        let backups_dir = backup_directory(&app_data_dir);
        Self {
            database: DatabaseAccess::Ready(Mutex::new(conn)),
            backups_dir,
        }
    }
}

fn initialize_database(
    conn: Connection,
    backups_dir: &Path,
    database_existed: bool,
) -> DatabaseAccess {
    if !matches!(database_integrity_is_ok(&conn), Ok(true)) {
        return DatabaseAccess::Recovery(recovery_status(
            "integrity_check_failed",
            schema_version(&conn).ok(),
            latest_snapshot_path(backups_dir),
            "Desclop did not migrate this database. Quit the app, make a copy of desclop.sqlite3, then restore a known SQLite snapshot before reopening.",
        ));
    }

    let current_version = match schema_version(&conn) {
        Ok(version) => version,
        Err(_) => {
            return DatabaseAccess::Recovery(recovery_status(
                "schema_version_unreadable",
                None,
                latest_snapshot_path(backups_dir),
                "Desclop did not migrate this database. Quit the app, make a copy of desclop.sqlite3, then restore a known SQLite snapshot before reopening.",
            ))
        }
    };

    if current_version > CURRENT_SCHEMA_VERSION {
        return DatabaseAccess::Recovery(recovery_status(
            "database_from_newer_app",
            Some(current_version),
            latest_snapshot_path(backups_dir),
            "Open this database with the same or a newer Desclop version. No migration was attempted.",
        ));
    }

    if matches!(migrations_are_pending(&conn), Ok(true)) && database_existed {
        let snapshot = match create_pre_migration_snapshot(&conn, backups_dir, current_version) {
            Ok(snapshot) => snapshot,
            Err(_) => {
                return DatabaseAccess::Recovery(recovery_status(
                    "safety_snapshot_failed",
                    Some(current_version),
                    latest_snapshot_path(backups_dir),
                    "Desclop did not run the migration. Free disk space or fix access to the local backups folder, then reopen the app.",
                ))
            }
        };

        if run_migrations(&conn).is_err() {
            return DatabaseAccess::Recovery(recovery_status(
                "migration_failed",
                schema_version(&conn).ok(),
                Some(snapshot.location),
                "Desclop preserved a pre-migration SQLite snapshot. Quit the app, copy desclop.sqlite3 aside, replace it with that snapshot, then reopen.",
            ));
        }
    } else if run_migrations(&conn).is_err() {
        return DatabaseAccess::Recovery(recovery_status(
            "migration_failed",
            schema_version(&conn).ok(),
            latest_snapshot_path(backups_dir),
            "Desclop did not complete the migration. The database was not replaced; reopen after resolving the problem or recover from a known snapshot.",
        ));
    }

    if !matches!(database_integrity_is_ok(&conn), Ok(true)) {
        return DatabaseAccess::Recovery(recovery_status(
            "integrity_check_failed_after_migration",
            schema_version(&conn).ok(),
            latest_snapshot_path(backups_dir),
            "Desclop preserved the pre-migration snapshot. Quit the app, copy desclop.sqlite3 aside, replace it with that snapshot, then reopen.",
        ));
    }

    DatabaseAccess::Ready(Mutex::new(conn))
}

fn ready_status(conn: &Connection) -> DatabaseRuntimeStatus {
    let schema_version = schema_version(conn).ok();
    let integrity = match database_integrity_is_ok(conn) {
        Ok(true) => "ok",
        Ok(false) => "failed",
        Err(_) => "unavailable",
    };
    DatabaseRuntimeStatus {
        state: "ready".to_string(),
        schema_version,
        target_schema_version: CURRENT_SCHEMA_VERSION,
        integrity: integrity.to_string(),
        recovery_code: None,
        recovery_backup_path: None,
        next_step: None,
    }
}

fn recovery_status(
    code: &str,
    schema_version: Option<i64>,
    recovery_backup_path: Option<String>,
    next_step: &str,
) -> DatabaseRuntimeStatus {
    DatabaseRuntimeStatus {
        state: "recovery_required".to_string(),
        schema_version,
        target_schema_version: CURRENT_SCHEMA_VERSION,
        integrity: "recovery_required".to_string(),
        recovery_code: Some(code.to_string()),
        recovery_backup_path,
        next_step: Some(next_step.to_string()),
    }
}

fn latest_snapshot_path(backups_dir: &Path) -> Option<String> {
    read_last_backup(backups_dir)
        .ok()
        .flatten()
        .and_then(snapshot_location)
}

fn snapshot_location(record: BackupRecord) -> Option<String> {
    (record.kind == "migration_snapshot").then_some(record.location)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, schema_version};
    use std::fs;

    fn temp_app_data_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("desclop-app-state-{name}-{}", uuid::Uuid::new_v4()))
    }

    fn seed_preserved_project(conn: &Connection) {
        conn.execute_batch(
            "insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('p1', 'Preserved project', '/tmp/preserved-project', 0, 'now', 'now');
             insert into plans (id, project_id, title, position, created_at, updated_at)
             values ('plan-1', 'p1', 'Preserved plan', 0, 'now', 'now');
             insert into stages (id, project_id, plan_id, title, position, status, created_at, updated_at)
             values ('stage-1', 'p1', 'plan-1', 'Preserved stage', 0, 'current', 'now', 'now');
             insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values ('task-1', 'p1', 'stage-1', 'Preserved task', 'active', 0, 'now', 'now');
             insert into notes (id, project_id, task_id, body, created_at)
             values ('note-1', 'p1', 'task-1', 'Preserved note', 'now');
             insert into work_entries (id, project_id, task_id, source, done, created_at)
             values ('work-1', 'p1', 'task-1', 'manual', 'Preserved work history', 'now');",
        )
        .expect("seed project data");
    }

    fn assert_preserved_project(conn: &Connection) {
        let content: (String, String, String, String, String) = conn
            .query_row(
                "select projects.name, plans.title, tasks.title, notes.body, work_entries.done
                 from projects
                 inner join plans on plans.project_id = projects.id
                 inner join stages on stages.plan_id = plans.id
                 inner join tasks on tasks.stage_id = stages.id
                 inner join notes on notes.task_id = tasks.id
                 inner join work_entries on work_entries.task_id = tasks.id
                 where projects.id = 'p1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("preserved project content");
        assert_eq!(
            content,
            (
                "Preserved project".to_string(),
                "Preserved plan".to_string(),
                "Preserved task".to_string(),
                "Preserved note".to_string(),
                "Preserved work history".to_string(),
            )
        );
    }

    #[test]
    fn test_state_reports_ready_database_status() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let state = AppState::from_connection_for_tests(conn);

        let status = state.database_status();

        assert_eq!(status.state, "ready");
        assert_eq!(status.schema_version, Some(CURRENT_SCHEMA_VERSION));
        assert_eq!(status.integrity, "ok");
    }

    #[test]
    fn existing_database_is_snapshotted_before_upgrade_and_preserves_working_memory() {
        let app_data_dir = temp_app_data_dir("upgrade-snapshot");
        fs::create_dir_all(&app_data_dir).expect("app data directory");
        let database_path = app_data_dir.join("desclop.sqlite3");
        let conn = open_connection(&database_path).expect("database");
        run_migrations(&conn).expect("migrations");
        seed_preserved_project(&conn);
        conn.execute_batch("alter table plans drop column archived_at;")
            .expect("simulate pre-archive schema");
        conn.pragma_update(None, "user_version", 1_i64)
            .expect("mark pending upgrade");
        drop(conn);

        let state = AppState::new(app_data_dir.clone()).expect("open app state");

        let status = state.database_status();
        assert_eq!(status.state, "ready");
        assert_eq!(status.schema_version, Some(CURRENT_SCHEMA_VERSION));
        let backup = read_last_backup(state.backups_dir())
            .expect("read backup metadata")
            .expect("migration snapshot");
        assert_eq!(backup.kind, "migration_snapshot");
        assert_eq!(backup.schema_version, Some(1));
        assert!(Path::new(&backup.location).is_file());

        let current = state.connection().expect("current database");
        assert_preserved_project(&current);
        drop(current);

        let snapshot = open_connection(Path::new(&backup.location)).expect("snapshot database");
        assert_preserved_project(&snapshot);
        drop(snapshot);
        drop(state);
        fs::remove_dir_all(app_data_dir).expect("cleanup app data directory");
    }

    #[test]
    fn failed_upgrade_keeps_the_database_and_exposes_a_recovery_snapshot() {
        let app_data_dir = temp_app_data_dir("failed-upgrade");
        fs::create_dir_all(&app_data_dir).expect("app data directory");
        let database_path = app_data_dir.join("desclop.sqlite3");
        let conn = open_connection(&database_path).expect("database");
        run_migrations(&conn).expect("migrations");
        seed_preserved_project(&conn);
        conn.pragma_update(None, "user_version", 1_i64)
            .expect("mark pending upgrade");
        conn.pragma_update(None, "foreign_keys", "OFF")
            .expect("disable foreign keys for malformed legacy fixture");
        conn.execute_batch(
            "drop table commit_task_links;
             drop table commits;
             create table commits (sha text primary key);
             create table commit_task_links (id text primary key);",
        )
        .expect("create malformed legacy commit schema");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("restore foreign keys");
        drop(conn);

        let state = AppState::new(app_data_dir.clone()).expect("open recovery state");

        let status = state.database_status();
        assert_eq!(status.state, "recovery_required");
        assert_eq!(status.recovery_code.as_deref(), Some("migration_failed"));
        let snapshot_path = status
            .recovery_backup_path
            .as_deref()
            .expect("recovery snapshot path");
        assert!(Path::new(snapshot_path).is_file());
        assert!(state.connection().is_err());

        let snapshot = open_connection(Path::new(snapshot_path)).expect("snapshot database");
        assert_preserved_project(&snapshot);
        drop(snapshot);

        let untouched = open_connection(&database_path).expect("original database");
        assert_eq!(schema_version(&untouched).expect("schema version"), 1);
        assert_preserved_project(&untouched);
        drop(untouched);
        drop(state);
        fs::remove_dir_all(app_data_dir).expect("cleanup app data directory");
    }

    #[test]
    fn corrupt_database_is_not_replaced_on_startup() {
        let app_data_dir = temp_app_data_dir("corrupt");
        fs::create_dir_all(&app_data_dir).expect("app data directory");
        let database_path = app_data_dir.join("desclop.sqlite3");
        let original = b"not a sqlite database";
        fs::write(&database_path, original).expect("corrupt database fixture");

        let state = AppState::new(app_data_dir.clone()).expect("recovery state");

        assert_eq!(state.database_status().state, "recovery_required");
        assert_eq!(
            state.database_status().recovery_code.as_deref(),
            Some("integrity_check_failed")
        );
        assert!(state.connection().is_err());
        assert_eq!(fs::read(&database_path).expect("original bytes"), original);

        drop(state);
        fs::remove_dir_all(app_data_dir).expect("cleanup app data directory");
    }
}

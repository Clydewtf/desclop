use std::fs;
use std::path::Path;

use git2::Repository;
use serde::Serialize;

use crate::app_state::{AppState, DatabaseRuntimeStatus};
use crate::repositories::projects::ProjectRepository;
use crate::services::backup_store::{backup_record_is_available, read_last_backup, BackupRecord};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiagnostics {
    pub app_version: String,
    pub project_path: String,
    pub folder_state: String,
    pub git: GitDiagnostics,
    pub database: DatabaseDiagnostics,
    pub last_backup: LastBackupDiagnostics,
    pub relink_available: bool,
    pub support_report: SupportDiagnostics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiagnostics {
    pub configured: bool,
    pub repository_detected: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseDiagnostics {
    pub state: String,
    pub schema_version: Option<i64>,
    pub target_schema_version: i64,
    pub integrity: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastBackupDiagnostics {
    pub state: String,
    pub kind: Option<String>,
    pub created_at: Option<String>,
    pub format_version: Option<u32>,
    pub schema_version: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportDiagnostics {
    pub diagnostic_format_version: u32,
    pub app_version: String,
    pub folder_state: String,
    pub git: GitDiagnostics,
    pub database: DatabaseDiagnostics,
    pub last_backup: LastBackupDiagnostics,
    pub relink_available: bool,
}

pub fn collect_project_diagnostics(
    state: &AppState,
    project_id: &str,
) -> Result<ProjectDiagnostics, String> {
    let project = {
        let conn = state.connection()?;
        ProjectRepository::new(&conn)
            .get_project(project_id)
            .map_err(|error| error.to_string())?
    };
    let folder_state = inspect_folder_state(Path::new(&project.local_path));
    let git = GitDiagnostics {
        configured: project.git_enabled,
        repository_detected: (folder_state == "available")
            .then(|| Repository::discover(&project.local_path).is_ok()),
    };
    let database = database_diagnostics(state.database_status());
    let last_backup = last_backup_diagnostics(state);
    let app_version = env!("CARGO_PKG_VERSION").to_string();
    let support_report = SupportDiagnostics {
        diagnostic_format_version: 1,
        app_version: app_version.clone(),
        folder_state: folder_state.clone(),
        git: git.clone(),
        database: database.clone(),
        last_backup: last_backup.clone(),
        relink_available: true,
    };

    Ok(ProjectDiagnostics {
        app_version,
        project_path: project.local_path,
        folder_state,
        git,
        database,
        last_backup,
        relink_available: true,
        support_report,
    })
}

fn database_diagnostics(status: DatabaseRuntimeStatus) -> DatabaseDiagnostics {
    DatabaseDiagnostics {
        state: status.state,
        schema_version: status.schema_version,
        target_schema_version: status.target_schema_version,
        integrity: status.integrity,
    }
}

fn last_backup_diagnostics(state: &AppState) -> LastBackupDiagnostics {
    match read_last_backup(state.backups_dir()) {
        Ok(Some(record)) => last_backup_from_record(record),
        Ok(None) => LastBackupDiagnostics {
            state: "none".to_string(),
            kind: None,
            created_at: None,
            format_version: None,
            schema_version: None,
        },
        Err(_) => LastBackupDiagnostics {
            state: "metadata_unavailable".to_string(),
            kind: None,
            created_at: None,
            format_version: None,
            schema_version: None,
        },
    }
}

fn last_backup_from_record(record: BackupRecord) -> LastBackupDiagnostics {
    LastBackupDiagnostics {
        state: if backup_record_is_available(&record) {
            "available".to_string()
        } else {
            "missing".to_string()
        },
        kind: Some(record.kind),
        created_at: Some(record.created_at),
        format_version: record.format_version,
        schema_version: record.schema_version,
    }
}

fn inspect_folder_state(path: &Path) -> String {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return "missing".to_string(),
        Err(_) => return "unreadable".to_string(),
    };

    if !metadata.is_dir() {
        return "not_a_directory".to_string();
    }

    match fs::read_dir(path) {
        Ok(_) => "available".to_string(),
        Err(_) => "unreadable".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::services::backup_store::{BackupRecord, BACKUP_METADATA_VERSION};
    use std::fs;

    #[test]
    fn support_diagnostics_exclude_user_content() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        conn.execute_batch(
            "insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('project-1', 'SECRET_PROJECT', '/tmp/desclop-diagnostics-missing', 0, 'now', 'now');
             insert into plans (id, project_id, title, position, created_at, updated_at)
             values ('plan-1', 'project-1', 'SECRET_PLAN', 0, 'now', 'now');
             insert into stages (id, project_id, plan_id, title, position, status, created_at, updated_at)
             values ('stage-1', 'project-1', 'plan-1', 'SECRET_STAGE', 0, 'current', 'now', 'now');
             insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values ('task-1', 'project-1', 'stage-1', 'SECRET_TASK', 'todo', 0, 'now', 'now');
             insert into notes (id, project_id, task_id, body, created_at)
             values ('note-1', 'project-1', 'task-1', 'SECRET_NOTE', 'now');
             insert into work_entries (id, project_id, task_id, source, done, remains, next_step, created_at)
             values ('work-1', 'project-1', 'task-1', 'manual', 'SECRET_WORK', 'SECRET_REMAINS', 'SECRET_NEXT', 'now');
             insert into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
             values ('project-1', 'secret-sha', 'SECRET_BRANCH', 'SECRET_COMMIT', 'SECRET_AUTHOR', 'now', '[]');",
        )
        .expect("seed user content");
        let state = AppState::from_connection_for_tests(conn);
        fs::create_dir_all(state.backups_dir()).expect("backups directory");
        fs::write(
            state.backups_dir().join("last-backup.json"),
            serde_json::to_vec(&BackupRecord {
                metadata_version: BACKUP_METADATA_VERSION,
                kind: "portable_project".to_string(),
                created_at: "2026-07-26T10:00:00Z".to_string(),
                location: "/tmp/SECRET_BACKUP_PATH.desclop".to_string(),
                format_version: Some(2),
                schema_version: None,
                byte_size: Some(123),
            })
            .expect("backup metadata"),
        )
        .expect("write backup metadata");

        let diagnostics = collect_project_diagnostics(&state, "project-1").expect("diagnostics");
        let report = serde_json::to_string(&diagnostics.support_report).expect("report json");

        for forbidden in [
            "SECRET_PROJECT",
            "SECRET_PLAN",
            "SECRET_STAGE",
            "SECRET_TASK",
            "SECRET_NOTE",
            "SECRET_WORK",
            "SECRET_REMAINS",
            "SECRET_NEXT",
            "secret-sha",
            "SECRET_BRANCH",
            "SECRET_COMMIT",
            "SECRET_AUTHOR",
            "/tmp/desclop-diagnostics-missing",
            "SECRET_BACKUP_PATH",
        ] {
            assert!(!report.contains(forbidden), "leaked {forbidden}");
        }
        assert_eq!(diagnostics.folder_state, "missing");
        assert_eq!(diagnostics.database.integrity, "ok");
        assert_eq!(
            diagnostics.support_report.last_backup.kind.as_deref(),
            Some("portable_project")
        );

        let _ = fs::remove_dir_all(state.backups_dir());
    }
}

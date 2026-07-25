use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{Connection, DatabaseName};
use uuid::Uuid;

pub const BACKUP_METADATA_VERSION: u32 = 1;
const LAST_BACKUP_FILE: &str = "last-backup.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub metadata_version: u32,
    pub kind: String,
    pub created_at: String,
    pub location: String,
    pub format_version: Option<u32>,
    pub schema_version: Option<i64>,
    pub byte_size: Option<u64>,
}

pub fn backup_directory(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("backups")
}

pub fn create_pre_migration_snapshot(
    conn: &Connection,
    backups_dir: &Path,
    schema_version_before: i64,
) -> Result<BackupRecord, String> {
    fs::create_dir_all(backups_dir).map_err(|error| {
        format!(
            "Could not create the local backup directory {}: {error}",
            backups_dir.display()
        )
    })?;

    let created_at = Utc::now().to_rfc3339();
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let final_path = backups_dir.join(format!(
        "migration-v{schema_version_before}-{stamp}-{}.sqlite3",
        Uuid::new_v4().simple()
    ));
    let temp_path = backups_dir.join(format!(
        ".migration-v{schema_version_before}-{stamp}-{}.tmp.sqlite3",
        Uuid::new_v4().simple()
    ));

    let result = (|| {
        conn.backup(DatabaseName::Main, &temp_path, None)
            .map_err(|error| format!("Could not create the SQLite safety snapshot: {error}"))?;
        verify_snapshot(&temp_path)?;
        fs::rename(&temp_path, &final_path).map_err(|error| {
            format!(
                "Could not finalize the SQLite safety snapshot {}: {error}",
                final_path.display()
            )
        })?;

        let record = BackupRecord {
            metadata_version: BACKUP_METADATA_VERSION,
            kind: "migration_snapshot".to_string(),
            created_at,
            location: final_path.to_string_lossy().to_string(),
            format_version: None,
            schema_version: Some(schema_version_before),
            byte_size: fs::metadata(&final_path)
                .ok()
                .map(|metadata| metadata.len()),
        };
        write_last_backup(backups_dir, &record)?;
        Ok(record)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    result
}

pub fn record_portable_backup(
    backups_dir: &Path,
    bundle_path: &Path,
    exported_at: String,
    format_version: u32,
) -> Result<BackupRecord, String> {
    fs::create_dir_all(backups_dir).map_err(|error| {
        format!(
            "Could not create the local backup directory {}: {error}",
            backups_dir.display()
        )
    })?;

    let record = BackupRecord {
        metadata_version: BACKUP_METADATA_VERSION,
        kind: "portable_project".to_string(),
        created_at: exported_at,
        location: bundle_path.to_string_lossy().to_string(),
        format_version: Some(format_version),
        schema_version: None,
        byte_size: fs::metadata(bundle_path)
            .ok()
            .map(|metadata| metadata.len()),
    };
    write_last_backup(backups_dir, &record)?;
    Ok(record)
}

pub fn read_last_backup(backups_dir: &Path) -> Result<Option<BackupRecord>, String> {
    let path = backups_dir.join(LAST_BACKUP_FILE);
    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path).map_err(|error| {
        format!(
            "Could not read last-backup metadata {}: {error}",
            path.display()
        )
    })?;
    let record: BackupRecord = serde_json::from_str(&text).map_err(|error| {
        format!(
            "Could not parse last-backup metadata {}: {error}",
            path.display()
        )
    })?;
    if record.metadata_version != BACKUP_METADATA_VERSION {
        return Err(format!(
            "Unsupported last-backup metadata version {}",
            record.metadata_version
        ));
    }
    Ok(Some(record))
}

pub fn backup_record_is_available(record: &BackupRecord) -> bool {
    Path::new(&record.location).exists()
}

fn verify_snapshot(path: &Path) -> Result<(), String> {
    let snapshot = Connection::open(path).map_err(|error| {
        format!("Could not open the SQLite safety snapshot for verification: {error}")
    })?;
    let check: String = snapshot
        .query_row("pragma quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not verify the SQLite safety snapshot: {error}"))?;
    if check.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err("The SQLite safety snapshot did not pass integrity verification".to_string())
    }
}

fn write_last_backup(backups_dir: &Path, record: &BackupRecord) -> Result<(), String> {
    let path = backups_dir.join(LAST_BACKUP_FILE);
    let temp_path = backups_dir.join(format!(".{LAST_BACKUP_FILE}-{}.tmp", Uuid::new_v4()));
    let data = serde_json::to_vec_pretty(record)
        .map_err(|error| format!("Could not encode last-backup metadata: {error}"))?;
    let result = (|| {
        fs::write(&temp_path, data).map_err(|error| {
            format!(
                "Could not write last-backup metadata {}: {error}",
                temp_path.display()
            )
        })?;
        fs::rename(&temp_path, &path).map_err(|error| {
            format!(
                "Could not finalize last-backup metadata {}: {error}",
                path.display()
            )
        })
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};

    fn temp_backups_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("desclop-backups-{name}-{}", Uuid::new_v4()))
    }

    #[test]
    fn snapshot_is_verified_and_can_be_opened_after_source_changes() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        conn.execute(
            "insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('p1', 'Before snapshot', '/tmp/project', 0, 'now', 'now')",
            [],
        )
        .expect("seed project");
        let backups_dir = temp_backups_dir("snapshot");

        let record = create_pre_migration_snapshot(&conn, &backups_dir, 1).expect("snapshot");

        conn.execute("delete from projects where id = 'p1'", [])
            .expect("mutate source");
        let snapshot = Connection::open(&record.location).expect("open snapshot");
        let name: String = snapshot
            .query_row("select name from projects where id = 'p1'", [], |row| {
                row.get(0)
            })
            .expect("snapshotted project");
        assert_eq!(name, "Before snapshot");
        assert!(backup_record_is_available(&record));
        assert_eq!(
            read_last_backup(&backups_dir)
                .expect("metadata")
                .expect("last backup")
                .kind,
            "migration_snapshot"
        );

        let _ = fs::remove_dir_all(backups_dir);
    }

    #[test]
    fn portable_backup_metadata_records_the_single_file_size() {
        let backups_dir = temp_backups_dir("portable-file");
        fs::create_dir_all(&backups_dir).expect("backups dir");
        let bundle_path = backups_dir.join("Desclop.desclop");
        fs::write(&bundle_path, b"portable backup bytes").expect("backup file");

        let record = record_portable_backup(
            &backups_dir,
            &bundle_path,
            "2026-07-26T10:00:00Z".to_string(),
            2,
        )
        .expect("record portable backup");

        assert_eq!(record.kind, "portable_project");
        assert_eq!(record.byte_size, Some(21));
        assert_eq!(
            read_last_backup(&backups_dir)
                .expect("read metadata")
                .expect("last backup")
                .location,
            bundle_path.to_string_lossy()
        );

        let _ = fs::remove_dir_all(backups_dir);
    }
}

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::domain::{CommitTaskLink, GitCommit, InboxItem, Note, ResumeBrief, WorkEntry};
use crate::repositories::projects::ProjectRepository;

pub const PORTABLE_BUNDLE_FORMAT_VERSION: u32 = 2;
const LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION: u32 = 1;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableProjectBundle {
    pub format_version: u32,
    pub exported_at: String,
    pub project: BundleProjectRow,
    #[serde(default)]
    pub plans: Vec<BundlePlanRow>,
    pub stages: Vec<BundleStageRow>,
    pub tasks: Vec<BundleTaskRow>,
    pub checklist_items: Vec<BundleChecklistItemRow>,
    pub notes: Vec<crate::domain::Note>,
    pub inbox_items: Vec<crate::domain::InboxItem>,
    pub work_entries: Vec<crate::domain::WorkEntry>,
    pub commits: Vec<crate::domain::GitCommit>,
    pub commit_task_links: Vec<crate::domain::CommitTaskLink>,
    pub resume_briefs: Vec<crate::domain::ResumeBrief>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundlePlanRow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleProjectRow {
    pub id: String,
    pub name: String,
    pub git_enabled: bool,
    pub git_remote: Option<String>,
    pub active_task_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleStageRow {
    pub id: String,
    pub project_id: String,
    #[serde(default)]
    pub plan_id: Option<String>,
    pub title: String,
    pub description: String,
    pub position: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundlePreview {
    pub format_version: u32,
    pub compatibility: String,
    pub project_name: String,
    pub plan_count: usize,
    pub stage_count: usize,
    pub task_count: usize,
    pub checklist_item_count: usize,
    pub note_count: usize,
    pub work_entry_count: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleTaskRow {
    pub id: String,
    pub project_id: String,
    pub stage_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub next_step: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleChecklistItemRow {
    pub id: String,
    pub task_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub completed: bool,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[allow(dead_code)]
pub fn export_project_bundle_to_folder(
    conn: &Connection,
    project_id: &str,
    destination_folder: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let bundle = build_project_bundle(conn, project_id)?;
    write_project_bundle_to_folder(&bundle, destination_folder)
}

pub fn build_project_bundle(
    conn: &Connection,
    project_id: &str,
) -> Result<PortableProjectBundle, String> {
    load_project_bundle(conn, project_id)
        .map_err(|err| format!("Failed to load project {project_id} for export: {err}"))
}

pub fn write_project_bundle_to_folder(
    bundle: &PortableProjectBundle,
    destination_folder: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let destination_folder = destination_folder.as_ref();
    std::fs::create_dir_all(destination_folder).map_err(|err| {
        format!(
            "Failed to create destination folder {}: {err}",
            destination_folder.display()
        )
    })?;

    let bundle_path = destination_folder.join(format!(
        "{}-{}-{}.desclop",
        bundle_folder_name(&bundle.project.name),
        Utc::now().format("%Y%m%dT%H%M%SZ"),
        Uuid::new_v4().simple()
    ));
    if bundle_path.exists() {
        return Err(format!(
            "Portable backup file already exists: {}",
            bundle_path.display()
        ));
    }

    let readme_path = bundle_readme_sidecar_path(&bundle_path);
    if readme_path.exists() {
        return Err(format!(
            "Portable backup README already exists: {}",
            readme_path.display()
        ));
    }

    let temp_path = destination_folder.join(format!(
        ".{}.tmp-{}",
        bundle_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("bundle.desclop"),
        Uuid::new_v4()
    ));

    let readme_temp_path = destination_folder.join(format!(
        ".{}.tmp-{}",
        readme_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("backup.README.md"),
        Uuid::new_v4()
    ));

    write_bundle_readme_temp_then_rename(&readme_temp_path, &readme_path)?;

    match write_project_bundle_temp_then_rename(bundle, &temp_path, &bundle_path) {
        Ok(path) => Ok(path),
        Err(err) => {
            // The README is created before the archive so a failed export never
            // leaves a partially documented backup behind.
            let _ = std::fs::remove_file(&temp_path);
            let _ = std::fs::remove_file(&readme_path);
            Err(err)
        }
    }
}

fn bundle_readme_sidecar_path(bundle_path: &Path) -> PathBuf {
    let stem = bundle_path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("Desclop-backup");
    bundle_path.with_file_name(format!("{stem}.README.md"))
}

fn write_bundle_readme_temp_then_rename(
    temp_path: &Path,
    readme_path: &Path,
) -> Result<(), String> {
    let result = (|| {
        let mut file = File::create(temp_path).map_err(|err| {
            format!(
                "Failed to create temporary portable backup README {}: {err}",
                temp_path.display()
            )
        })?;
        file.write_all(bundle_readme().as_bytes()).map_err(|err| {
            format!(
                "Failed to write temporary portable backup README {}: {err}",
                temp_path.display()
            )
        })?;
        file.sync_all().map_err(|err| {
            format!(
                "Failed to flush temporary portable backup README {}: {err}",
                temp_path.display()
            )
        })?;
        std::fs::rename(temp_path, readme_path).map_err(|err| {
            format!(
                "Failed to finalize portable backup README {}: {err}",
                readme_path.display()
            )
        })?;
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(temp_path);
    }

    result
}

fn write_project_bundle_temp_then_rename(
    bundle: &PortableProjectBundle,
    temp_path: &Path,
    bundle_path: &Path,
) -> Result<PathBuf, String> {
    let manifest_json = serde_json::to_string_pretty(&bundle).map_err(|err| err.to_string())?;
    let file = File::create(temp_path).map_err(|err| {
        format!(
            "Failed to create temporary backup file {}: {err}",
            temp_path.display()
        )
    })?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    archive
        .start_file("manifest.json", options)
        .map_err(|err| format!("Failed to create manifest in portable backup: {err}"))?;
    archive
        .write_all(manifest_json.as_bytes())
        .map_err(|err| format!("Failed to write portable backup manifest: {err}"))?;
    archive
        .start_file("README.md", options)
        .map_err(|err| format!("Failed to create README in portable backup: {err}"))?;
    archive
        .write_all(bundle_readme().as_bytes())
        .map_err(|err| format!("Failed to write portable backup README: {err}"))?;
    let file = archive
        .finish()
        .map_err(|err| format!("Failed to finalize temporary portable backup: {err}"))?;
    file.sync_all().map_err(|err| {
        format!(
            "Failed to flush temporary portable backup {}: {err}",
            temp_path.display()
        )
    })?;

    read_project_bundle_from_path(temp_path)?;
    std::fs::rename(temp_path, bundle_path).map_err(|err| {
        format!(
            "Failed to finalize portable backup {}: {err}",
            bundle_path.display()
        )
    })?;

    Ok(bundle_path.to_path_buf())
}

#[allow(dead_code)]
pub fn import_project_bundle_from_folder(
    conn: &mut Connection,
    bundle_folder: impl AsRef<Path>,
    reselected_local_path: &str,
) -> Result<String, String> {
    if reselected_local_path.trim().is_empty() {
        return Err("Project folder is required".to_string());
    }

    let bundle = read_project_bundle_from_path(bundle_folder.as_ref())?;

    import_project_bundle(conn, bundle, reselected_local_path, bundle_folder.as_ref())
}

#[allow(dead_code)]
pub fn read_project_bundle_from_folder(
    bundle_folder: impl AsRef<Path>,
) -> Result<PortableProjectBundle, String> {
    read_project_bundle_from_path(bundle_folder)
}

pub fn read_project_bundle_from_path(
    bundle_path: impl AsRef<Path>,
) -> Result<PortableProjectBundle, String> {
    let bundle_path = bundle_path.as_ref();
    if bundle_path.is_file() {
        return read_project_bundle_from_archive(bundle_path);
    }
    if bundle_path.is_dir() {
        return read_project_bundle_from_legacy_folder(bundle_path);
    }
    Err(format!(
        "Backup file or legacy backup folder was not found: {}",
        bundle_path.display()
    ))
}

fn read_project_bundle_from_legacy_folder(
    bundle_folder: &Path,
) -> Result<PortableProjectBundle, String> {
    let manifest_path = bundle_folder.join("manifest.json");
    let manifest_json = std::fs::read_to_string(&manifest_path).map_err(|err| {
        format!(
            "Failed to read bundle manifest {}: {err}",
            manifest_path.display()
        )
    })?;
    parse_project_bundle_manifest(&manifest_json, &manifest_path.display().to_string())
}

fn read_project_bundle_from_archive(bundle_path: &Path) -> Result<PortableProjectBundle, String> {
    let file = File::open(bundle_path).map_err(|err| {
        format!(
            "Failed to open portable backup {}: {err}",
            bundle_path.display()
        )
    })?;
    let mut archive = ZipArchive::new(file).map_err(|err| {
        format!(
            "Failed to open portable backup {}: {err}",
            bundle_path.display()
        )
    })?;
    let manifest = archive.by_name("manifest.json").map_err(|err| {
        format!(
            "Portable backup {} does not contain manifest.json: {err}",
            bundle_path.display()
        )
    })?;
    if manifest.size() > MAX_MANIFEST_BYTES {
        return Err(format!(
            "Portable backup manifest is too large (maximum {MAX_MANIFEST_BYTES} bytes)"
        ));
    }
    let mut manifest_bytes = Vec::new();
    manifest
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut manifest_bytes)
        .map_err(|err| {
            format!(
                "Failed to read portable backup manifest {}: {err}",
                bundle_path.display()
            )
        })?;
    if manifest_bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(format!(
            "Portable backup manifest is too large (maximum {MAX_MANIFEST_BYTES} bytes)"
        ));
    }
    let manifest_json = String::from_utf8(manifest_bytes).map_err(|err| {
        format!(
            "Portable backup manifest {} is not UTF-8: {err}",
            bundle_path.display()
        )
    })?;
    parse_project_bundle_manifest(&manifest_json, &bundle_path.display().to_string())
}

fn parse_project_bundle_manifest(
    manifest_json: &str,
    source_label: &str,
) -> Result<PortableProjectBundle, String> {
    let mut bundle: PortableProjectBundle = serde_json::from_str(manifest_json)
        .map_err(|err| format!("Failed to parse bundle manifest {source_label}: {err}"))?;

    if !matches!(
        bundle.format_version,
        LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION | PORTABLE_BUNDLE_FORMAT_VERSION
    ) {
        return Err(format!(
            "Unsupported bundle format version {}",
            bundle.format_version
        ));
    }

    normalize_legacy_bundle(&mut bundle)?;
    validate_bundle_integrity(&bundle)?;
    Ok(bundle)
}

#[allow(dead_code)]
pub fn inspect_project_bundle_from_folder(
    bundle_folder: impl AsRef<Path>,
) -> Result<PortableBundlePreview, String> {
    inspect_project_bundle_from_path(bundle_folder)
}

pub fn inspect_project_bundle_from_path(
    bundle_path: impl AsRef<Path>,
) -> Result<PortableBundlePreview, String> {
    let bundle = read_project_bundle_from_path(bundle_path)?;
    Ok(PortableBundlePreview {
        format_version: bundle.format_version,
        compatibility: if bundle.format_version == LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION {
            "legacy_v1".to_string()
        } else {
            "current".to_string()
        },
        project_name: bundle.project.name,
        plan_count: bundle.plans.len(),
        stage_count: bundle.stages.len(),
        task_count: bundle.tasks.len(),
        checklist_item_count: bundle.checklist_items.len(),
        note_count: bundle.notes.len(),
        work_entry_count: bundle.work_entries.len(),
    })
}

pub fn import_project_bundle(
    conn: &mut Connection,
    mut bundle: PortableProjectBundle,
    reselected_local_path: &str,
    bundle_folder: impl AsRef<Path>,
) -> Result<String, String> {
    if reselected_local_path.trim().is_empty() {
        return Err("Project folder is required".to_string());
    }

    normalize_legacy_bundle(&mut bundle)?;
    validate_bundle_integrity(&bundle)?;
    import_bundle(conn, bundle, reselected_local_path).map_err(|err| {
        format!(
            "Failed to import bundle {}: {err}",
            bundle_folder.as_ref().display()
        )
    })
}

fn load_project_bundle(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<PortableProjectBundle> {
    let project = ProjectRepository::new(conn).get_project(project_id)?;
    let project = BundleProjectRow {
        id: project.id,
        name: project.name,
        git_enabled: project.git_enabled,
        git_remote: project.git_remote,
        active_task_id: project.active_task_id,
        created_at: project.created_at,
        updated_at: project.updated_at,
    };

    Ok(PortableProjectBundle {
        format_version: PORTABLE_BUNDLE_FORMAT_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        plans: list_plan_rows(conn, project_id)?,
        stages: list_stage_rows(conn, project_id)?,
        tasks: list_task_rows(conn, project_id)?,
        checklist_items: list_checklist_item_rows(conn, project_id)?,
        notes: list_notes(conn, project_id)?,
        inbox_items: list_inbox_items(conn, project_id)?,
        work_entries: list_work_entries(conn, project_id)?,
        commits: list_commits(conn, project_id)?,
        commit_task_links: list_commit_task_links(conn, project_id)?,
        resume_briefs: list_resume_briefs(conn, project_id)?,
        project,
    })
}

fn import_bundle(
    conn: &mut Connection,
    bundle: PortableProjectBundle,
    reselected_local_path: &str,
) -> rusqlite::Result<String> {
    let tx = conn.transaction()?;
    let new_project_id = Uuid::new_v4().to_string();
    // A restored project is new in this Desclop library, even though its workflow
    // rows keep their original timestamps. This also makes it appear first in the
    // project picker, which is ordered by project.updated_at.
    let restored_at = Utc::now().to_rfc3339();
    let mut plan_ids = HashMap::new();
    let mut stage_ids = HashMap::new();
    let mut task_ids = HashMap::new();

    tx.execute(
        "insert into projects (id, name, local_path, git_enabled, git_remote, active_task_id, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, null, ?6, ?7)",
        params![
            new_project_id,
            bundle.project.name,
            reselected_local_path,
            bundle.project.git_enabled as i32,
            bundle.project.git_remote,
            bundle.project.created_at,
            restored_at
        ],
    )?;

    for plan in bundle.plans {
        let new_plan_id = Uuid::new_v4().to_string();
        plan_ids.insert(plan.id.clone(), new_plan_id.clone());
        tx.execute(
            "insert into plans (id, project_id, title, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                new_plan_id,
                new_project_id,
                plan.title,
                plan.position,
                plan.created_at,
                plan.updated_at
            ],
        )?;
    }

    for stage in bundle.stages {
        let new_stage_id = Uuid::new_v4().to_string();
        stage_ids.insert(stage.id.clone(), new_stage_id.clone());
        tx.execute(
            "insert into stages (id, project_id, plan_id, title, description, position, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                new_stage_id,
                new_project_id,
                remap_required(
                    &plan_ids,
                    stage.plan_id.as_deref().unwrap_or_default(),
                    "plan_id"
                )?,
                stage.title,
                stage.description,
                stage.position,
                stage.status,
                stage.created_at,
                stage.updated_at
            ],
        )?;
    }

    for task in bundle.tasks {
        let new_task_id = Uuid::new_v4().to_string();
        let new_stage_id = remap_required(&stage_ids, &task.stage_id, "stage_id")?;
        task_ids.insert(task.id.clone(), new_task_id.clone());
        tx.execute(
            "insert into tasks (id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at, completed_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                new_task_id,
                new_project_id,
                new_stage_id,
                task.title,
                task.description,
                task.status,
                task.priority,
                task.due_date,
                task.next_step,
                task.position,
                task.created_at,
                task.updated_at,
                task.completed_at
            ],
        )?;
    }

    for item in bundle.checklist_items {
        tx.execute(
            "insert into checklist_items (id, task_id, title, description, completed, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                remap_required(&task_ids, &item.task_id, "task_id")?,
                item.title,
                item.description,
                item.completed as i32,
                item.position,
                item.created_at,
                item.updated_at
            ],
        )?;
    }

    for note in bundle.notes {
        tx.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                new_project_id,
                remap_optional(&task_ids, note.task_id.as_deref(), "task_id")?,
                note.body,
                note.created_at
            ],
        )?;
    }

    for item in bundle.inbox_items {
        tx.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                new_project_id,
                remap_optional(&task_ids, item.task_id.as_deref(), "task_id")?,
                item.body,
                item.kind,
                item.status,
                item.created_at,
                item.updated_at
            ],
        )?;
    }

    for entry in bundle.work_entries {
        tx.execute(
            "insert into work_entries (id, project_id, task_id, source, started_at, ended_at, duration_seconds, done, remains, next_step, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                Uuid::new_v4().to_string(),
                new_project_id,
                remap_optional(&task_ids, entry.task_id.as_deref(), "task_id")?,
                entry.source,
                entry.started_at,
                entry.ended_at,
                entry.duration_seconds,
                entry.done,
                entry.remains,
                entry.next_step,
                entry.created_at
            ],
        )?;
    }

    for commit in bundle.commits {
        tx.execute(
            "insert into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                new_project_id,
                commit.sha,
                commit.branch,
                commit.message,
                commit.author_name,
                commit.committed_at,
                serde_json::to_string(&commit.changed_files).unwrap_or_else(|_| "[]".to_string())
            ],
        )?;
    }

    for link in bundle.commit_task_links {
        tx.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                new_project_id,
                remap_required(&task_ids, &link.task_id, "task_id")?,
                link.commit_sha,
                link.link_mode,
                link.created_at
            ],
        )?;
    }

    for brief in bundle.resume_briefs {
        tx.execute(
            "insert into resume_briefs (id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                new_project_id,
                remap_optional(&task_ids, brief.task_id.as_deref(), "task_id")?,
                remap_optional(&stage_ids, brief.stage_id.as_deref(), "stage_id")?,
                brief.latest_note,
                brief.next_step,
                serde_json::to_string(&brief.facts).unwrap_or_else(|_| "[]".to_string()),
                brief.generated_at
            ],
        )?;
    }

    if let Some(active_task_id) = remap_optional(
        &task_ids,
        bundle.project.active_task_id.as_deref(),
        "active_task_id",
    )? {
        tx.execute(
            "update projects set active_task_id = ?1 where id = ?2",
            params![active_task_id, new_project_id],
        )?;
    }

    tx.commit()?;
    Ok(new_project_id)
}

fn validate_bundle_integrity(bundle: &PortableProjectBundle) -> Result<(), String> {
    let project_id = &bundle.project.id;
    let mut plan_ids = HashSet::new();
    for plan in &bundle.plans {
        if !plan_ids.insert(plan.id.clone()) {
            return Err(format!("Duplicate plan id {}", plan.id));
        }
        if &plan.project_id != project_id {
            return Err(format!(
                "plan projectId does not match bundle project: {}",
                plan.id
            ));
        }
    }

    let mut stage_ids = HashSet::new();
    for stage in &bundle.stages {
        if !stage_ids.insert(stage.id.clone()) {
            return Err(format!("Duplicate stage id {}", stage.id));
        }
        if &stage.project_id != project_id {
            return Err(format!(
                "stage projectId does not match bundle project: {}",
                stage.id
            ));
        }
        let Some(plan_id) = &stage.plan_id else {
            return Err(format!("Missing plan for stage {}", stage.id));
        };
        if !plan_ids.contains(plan_id) {
            return Err(format!("Missing plan for stage {}: {plan_id}", stage.id));
        }
    }

    let mut task_ids = HashSet::new();
    for task in &bundle.tasks {
        if !task_ids.insert(task.id.clone()) {
            return Err(format!("Duplicate task id {}", task.id));
        }
        if &task.project_id != project_id {
            return Err(format!(
                "task projectId does not match bundle project: {}",
                task.id
            ));
        }
        if !stage_ids.contains(&task.stage_id) {
            return Err(format!(
                "Missing stage for task {}: {}",
                task.id, task.stage_id
            ));
        }
    }

    if let Some(active_task_id) = &bundle.project.active_task_id {
        if !task_ids.contains(active_task_id) {
            return Err(format!("Missing active task: {active_task_id}"));
        }
    }

    for item in &bundle.checklist_items {
        if !task_ids.contains(&item.task_id) {
            return Err(format!(
                "Missing task for checklist item {}: {}",
                item.id, item.task_id
            ));
        }
    }

    validate_optional_task_rows(
        "note",
        bundle.notes.iter().map(|note| {
            (
                note.id.as_str(),
                note.project_id.as_str(),
                note.task_id.as_deref(),
            )
        }),
        project_id,
        &task_ids,
    )?;
    validate_optional_task_rows(
        "inbox item",
        bundle.inbox_items.iter().map(|item| {
            (
                item.id.as_str(),
                item.project_id.as_str(),
                item.task_id.as_deref(),
            )
        }),
        project_id,
        &task_ids,
    )?;
    validate_optional_task_rows(
        "work entry",
        bundle.work_entries.iter().map(|entry| {
            (
                entry.id.as_str(),
                entry.project_id.as_str(),
                entry.task_id.as_deref(),
            )
        }),
        project_id,
        &task_ids,
    )?;

    let mut commit_shas = HashSet::new();
    for commit in &bundle.commits {
        if commit.project_id != *project_id {
            return Err(format!(
                "commit projectId does not match bundle project: {}",
                commit.sha
            ));
        }
        if !commit_shas.insert(commit.sha.clone()) {
            return Err(format!("Duplicate commit sha {}", commit.sha));
        }
    }

    for link in &bundle.commit_task_links {
        if link.project_id != *project_id {
            return Err(format!(
                "commit task link projectId does not match bundle project: {}",
                link.id
            ));
        }
        if !task_ids.contains(&link.task_id) {
            return Err(format!(
                "Missing task for commit task link {}: {}",
                link.id, link.task_id
            ));
        }
        if !commit_shas.contains(&link.commit_sha) {
            return Err(format!(
                "Missing commit for commit task link {}: {}",
                link.id, link.commit_sha
            ));
        }
    }

    for brief in &bundle.resume_briefs {
        if brief.project_id != *project_id {
            return Err(format!(
                "resume brief projectId does not match bundle project: {}",
                brief.id
            ));
        }
        if let Some(task_id) = &brief.task_id {
            if !task_ids.contains(task_id) {
                return Err(format!(
                    "Missing task for resume brief {}: {}",
                    brief.id, task_id
                ));
            }
        }
        if let Some(stage_id) = &brief.stage_id {
            if !stage_ids.contains(stage_id) {
                return Err(format!(
                    "Missing stage for resume brief {}: {}",
                    brief.id, stage_id
                ));
            }
        }
    }

    Ok(())
}

fn normalize_legacy_bundle(bundle: &mut PortableProjectBundle) -> Result<(), String> {
    if bundle.format_version != LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION {
        return Ok(());
    }

    let plan_id = format!("legacy-plan-{}", bundle.project.id);
    if bundle.plans.is_empty() {
        bundle.plans.push(BundlePlanRow {
            id: plan_id.clone(),
            project_id: bundle.project.id.clone(),
            title: "Imported plan".to_string(),
            position: 0,
            created_at: bundle.project.created_at.clone(),
            updated_at: bundle.project.updated_at.clone(),
        });
    }
    for stage in &mut bundle.stages {
        if stage.plan_id.is_none() {
            stage.plan_id = Some(plan_id.clone());
        }
    }

    Ok(())
}

fn validate_optional_task_rows<'a>(
    label: &str,
    rows: impl Iterator<Item = (&'a str, &'a str, Option<&'a str>)>,
    project_id: &str,
    task_ids: &HashSet<String>,
) -> Result<(), String> {
    for (id, row_project_id, task_id) in rows {
        if row_project_id != project_id {
            return Err(format!(
                "{label} projectId does not match bundle project: {id}"
            ));
        }
        if let Some(task_id) = task_id {
            if !task_ids.contains(task_id) {
                return Err(format!("Missing task for {label} {id}: {task_id}"));
            }
        }
    }
    Ok(())
}

fn remap_required(
    map: &HashMap<String, String>,
    old_id: &str,
    label: &str,
) -> rusqlite::Result<String> {
    map.get(old_id).cloned().ok_or_else(|| {
        rusqlite::Error::InvalidParameterName(format!("Missing remapped {label}: {old_id}"))
    })
}

fn remap_optional(
    map: &HashMap<String, String>,
    old_id: Option<&str>,
    label: &str,
) -> rusqlite::Result<Option<String>> {
    old_id
        .map(|old_id| remap_required(map, old_id, label))
        .transpose()
}

fn list_plan_rows(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<BundlePlanRow>> {
    let mut stmt = conn.prepare(
        "select id, project_id, title, position, created_at, updated_at
         from plans
         where project_id = ?1
         order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(BundlePlanRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            position: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

fn list_stage_rows(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<BundleStageRow>> {
    let mut stmt = conn.prepare(
        "select id, project_id, plan_id, title, description, position, status, created_at, updated_at
         from stages
         where project_id = ?1
         order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(BundleStageRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            plan_id: row.get(2)?,
            title: row.get(3)?,
            description: row.get(4)?,
            position: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

fn list_task_rows(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<BundleTaskRow>> {
    let mut stmt = conn.prepare(
        "select id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at, completed_at
         from tasks
         where project_id = ?1
         order by stage_id asc, position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(BundleTaskRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            stage_id: row.get(2)?,
            title: row.get(3)?,
            description: row.get(4)?,
            status: row.get(5)?,
            priority: row.get(6)?,
            due_date: row.get(7)?,
            next_step: row.get(8)?,
            position: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            completed_at: row.get(12)?,
        })
    })?;
    rows.collect()
}

fn list_checklist_item_rows(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<Vec<BundleChecklistItemRow>> {
    let mut stmt = conn.prepare(
        "select checklist_items.id, checklist_items.task_id, checklist_items.title,
                checklist_items.description, checklist_items.completed, checklist_items.position,
                checklist_items.created_at, checklist_items.updated_at
         from checklist_items
         inner join tasks on tasks.id = checklist_items.task_id
         where tasks.project_id = ?1
         order by checklist_items.task_id asc, checklist_items.position asc, checklist_items.id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(BundleChecklistItemRow {
            id: row.get(0)?,
            task_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            completed: row.get::<_, i32>(4)? == 1,
            position: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

fn list_notes(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<Note>> {
    let mut stmt = conn.prepare(
        "select id, project_id, task_id, body, created_at
         from notes
         where project_id = ?1
         order by created_at asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Note {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            body: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

fn list_inbox_items(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<InboxItem>> {
    let mut stmt = conn.prepare(
        "select id, project_id, task_id, body, kind, status, created_at, updated_at
         from inbox_items
         where project_id = ?1
         order by created_at asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(InboxItem {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            body: row.get(3)?,
            kind: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

fn list_work_entries(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<WorkEntry>> {
    let mut stmt = conn.prepare(
        "select id, project_id, task_id, source, started_at, ended_at, duration_seconds, done, remains, next_step, created_at
         from work_entries
         where project_id = ?1
         order by created_at asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(WorkEntry {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            source: row.get(3)?,
            started_at: row.get(4)?,
            ended_at: row.get(5)?,
            duration_seconds: row.get(6)?,
            done: row.get(7)?,
            remains: row.get(8)?,
            next_step: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    rows.collect()
}

fn list_commits(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<GitCommit>> {
    let mut stmt = conn.prepare(
        "select sha, project_id, branch, message, author_name, committed_at, changed_files_json
         from commits
         where project_id = ?1
         order by committed_at asc, sha asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let changed_files_json: String = row.get(6)?;
        Ok(GitCommit {
            sha: row.get(0)?,
            project_id: row.get(1)?,
            branch: row.get(2)?,
            message: row.get(3)?,
            author_name: row.get(4)?,
            committed_at: row.get(5)?,
            changed_files: serde_json::from_str(&changed_files_json).unwrap_or_default(),
        })
    })?;
    rows.collect()
}

fn list_commit_task_links(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<Vec<CommitTaskLink>> {
    let mut stmt = conn.prepare(
        "select id, project_id, task_id, commit_sha, link_mode, created_at
         from commit_task_links
         where project_id = ?1
         order by created_at asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(CommitTaskLink {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            commit_sha: row.get(3)?,
            link_mode: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

fn list_resume_briefs(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<ResumeBrief>> {
    let mut stmt = conn.prepare(
        "select id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at
         from resume_briefs
         where project_id = ?1
         order by generated_at asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let facts_json: String = row.get(6)?;
        Ok(ResumeBrief {
            id: row.get(0)?,
            project_id: row.get(1)?,
            task_id: row.get(2)?,
            stage_id: row.get(3)?,
            latest_note: row.get(4)?,
            next_step: row.get(5)?,
            facts: serde_json::from_str(&facts_json).unwrap_or_default(),
            generated_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

fn bundle_folder_name(project_name: &str) -> String {
    let sanitized: String = project_name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '?' | '*' | '"' | '<' | '>' | '|' => '_',
            character => character,
        })
        .collect();
    let trimmed = sanitized.trim();
    let name = if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    };
    name.chars().take(82).collect()
}

fn bundle_readme() -> &'static str {
    "# Desclop Backup\n\nThis README accompanies a single-file Desclop portable backup (`.desclop`). The `.desclop` file is the backup data; it is a standard ZIP archive with a Desclop extension, so it can be stored and moved as one file.\n\n## Keep together\n\nKeep this README next to its matching `.desclop` file when moving or sharing the backup. Desclop restores the `.desclop` file itself; this README contains instructions only and no project content.\n\n## Included\n\n- Plans, stages, tasks, checklists, notes, inbox items, work history, commits and resume briefs\n- Project Git settings\n\n## Not included\n\n- Source code\n- The original local project-folder path\n- A copy of the live SQLite database\n\n## Restore\n\n1. Open Desclop and choose **Restore backup** from the project picker or first-run screen.\n2. Select the matching `.desclop` file.\n3. Select the current local project folder.\n4. Review the backup summary and confirm restore.\n\nRestore creates a separate local project record and never overwrites an existing project. If restore cannot complete, keep the original `.desclop` file unchanged and retry after resolving the displayed issue. For database-upgrade recovery, use the local SQLite safety snapshot reported by Diagnostics instead.\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{
        ImportChecklistItem, ImportStage, ImportTask, PlanRepository,
    };
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::tasks::TaskRepository;
    use rusqlite::params;
    use std::fs;
    use std::io::Read;

    fn temp_bundle_destination(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("desclop-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).expect("temp dir");
        path
    }

    fn seed_full_project(conn: &mut rusqlite::Connection) -> (String, String, String) {
        run_migrations(conn).expect("migrations");
        let project = ProjectRepository::new(conn)
            .create_project(
                "Desclop".to_string(),
                "/tmp/desclop-source".to_string(),
                true,
            )
            .expect("create project");
        conn.execute(
            "update projects set git_remote = 'git@example.com:desclop.git' where id = ?1",
            params![project.id],
        )
        .expect("remote");
        PlanRepository::new(conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: "Core setup".to_string(),
                    position: 0,
                    tasks: vec![ImportTask {
                        title: "Create store".to_string(),
                        description: "".to_string(),
                        status: "todo".to_string(),
                        checklist: vec![ImportChecklistItem {
                            title: "Add migration".to_string(),
                            description: "".to_string(),
                            completed: true,
                            position: 0,
                        }],
                        position: 0,
                    }],
                }],
            )
            .expect("plan");
        let stage = TaskRepository::new(conn)
            .list_stages(&project.id)
            .expect("stages")
            .into_iter()
            .next()
            .expect("stage");
        let task = TaskRepository::new(conn)
            .list_tasks(&project.id)
            .expect("tasks")
            .into_iter()
            .next()
            .expect("task");
        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('note-1', ?1, ?2, 'Remember context', '2026-05-20T10:00:00Z')",
            params![project.id, task.id],
        )
        .expect("note");
        conn.execute(
            "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
             values ('inbox-1', ?1, ?2, 'Follow up', 'question', 'attached', '2026-05-20T10:01:00Z', '2026-05-20T10:02:00Z')",
            params![project.id, task.id],
        )
        .expect("inbox");
        conn.execute(
            "insert into work_entries (id, project_id, task_id, source, started_at, ended_at, duration_seconds, done, remains, next_step, created_at)
             values ('work-1', ?1, ?2, 'manual', null, null, 900, 'Done', 'More', 'Run tests', '2026-05-20T10:03:00Z')",
            params![project.id, task.id],
        )
        .expect("work entry");
        conn.execute(
            "insert into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
             values (?1, 'abc123', 'main', 'Initial', 'Clyde', '2026-05-20T10:04:00Z', '[\"src/main.ts\"]')",
            params![project.id],
        )
        .expect("commit");
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link-1', ?1, ?2, 'abc123', 'manual', '2026-05-20T10:05:00Z')",
            params![project.id, task.id],
        )
        .expect("link");
        conn.execute(
            "insert into resume_briefs (id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at)
             values ('brief-1', ?1, ?2, ?3, 'Remember context', 'Run tests', '[\"1 recent commit on main\"]', '2026-05-20T10:06:00Z')",
            params![project.id, task.id, stage.id],
        )
        .expect("brief");

        (project.id, stage.id, task.id)
    }

    fn seed_project_with_timestamped_tasks(
        conn: &mut rusqlite::Connection,
    ) -> (String, String, String, String) {
        run_migrations(conn).expect("migrations");
        let project = ProjectRepository::new(conn)
            .create_project(
                "Chronology".to_string(),
                "/tmp/chronology-source".to_string(),
                false,
            )
            .expect("create project");
        PlanRepository::new(conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Timed stage".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![
                        ImportTask {
                            title: "Older open task".to_string(),
                            description: "".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![ImportChecklistItem {
                                title: "Timed checklist".to_string(),
                                description: "".to_string(),
                                completed: false,
                                position: 0,
                            }],
                            position: 0,
                        },
                        ImportTask {
                            title: "Newer open task".to_string(),
                            description: "".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 1,
                        },
                    ],
                }],
            )
            .expect("plan");

        let stage_id: String = conn
            .query_row(
                "select id from stages where project_id = ?1",
                params![project.id],
                |row| row.get(0),
            )
            .expect("stage");
        let older_task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1 and title = 'Older open task'",
                params![project.id],
                |row| row.get(0),
            )
            .expect("older task");
        let newer_task_id: String = conn
            .query_row(
                "select id from tasks where project_id = ?1 and title = 'Newer open task'",
                params![project.id],
                |row| row.get(0),
            )
            .expect("newer task");
        conn.execute(
            "update projects set active_task_id = null, created_at = '2026-05-01T00:00:00Z', updated_at = '2026-05-01T00:00:00Z' where id = ?1",
            params![project.id],
        )
        .expect("project timestamps");
        conn.execute(
            "update stages set created_at = '2026-05-02T00:00:00Z', updated_at = '2026-05-03T00:00:00Z' where id = ?1",
            params![stage_id],
        )
        .expect("stage timestamps");
        conn.execute(
            "update tasks set next_step = 'Keep older task waiting', created_at = '2026-05-04T00:00:00Z', updated_at = '2026-05-05T00:00:00Z' where id = ?1",
            params![older_task_id],
        )
        .expect("older timestamps");
        conn.execute(
            "update tasks set next_step = 'Resume newer task', created_at = '2026-05-06T00:00:00Z', updated_at = '2026-05-07T00:00:00Z' where id = ?1",
            params![newer_task_id],
        )
        .expect("newer timestamps");
        conn.execute(
            "update checklist_items set created_at = '2026-05-08T00:00:00Z', updated_at = '2026-05-09T00:00:00Z' where task_id = ?1",
            params![older_task_id],
        )
        .expect("checklist timestamps");

        (project.id, stage_id, older_task_id, newer_task_id)
    }

    fn write_manifest(destination: &std::path::Path, bundle: &PortableProjectBundle) {
        fs::create_dir_all(destination).expect("bundle dir");
        fs::write(
            destination.join("manifest.json"),
            serde_json::to_string_pretty(bundle).expect("manifest json"),
        )
        .expect("write manifest");
    }

    fn read_bundle(bundle_path: &std::path::Path) -> PortableProjectBundle {
        serde_json::from_str(&read_archive_entry(bundle_path, "manifest.json"))
            .expect("manifest json")
    }

    fn read_archive_entry(bundle_path: &std::path::Path, entry_name: &str) -> String {
        let file = File::open(bundle_path).expect("open archive");
        let mut archive = ZipArchive::new(file).expect("archive");
        let mut entry = archive.by_name(entry_name).expect("archive entry");
        let mut text = String::new();
        entry.read_to_string(&mut text).expect("read archive entry");
        text
    }

    fn project_count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("select count(*) from projects", [], |row| row.get(0))
            .expect("project count")
    }

    #[test]
    fn export_writes_manifest_and_matching_readme_sidecar() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("export");

        let bundle_path =
            export_project_bundle_to_folder(&conn, &project_id, &destination).expect("export");

        let manifest: PortableProjectBundle =
            serde_json::from_str(&read_archive_entry(&bundle_path, "manifest.json"))
                .expect("manifest json");
        let archived_readme = read_archive_entry(&bundle_path, "README.md");
        let sidecar_readme_path = bundle_readme_sidecar_path(&bundle_path);
        let sidecar_readme = fs::read_to_string(&sidecar_readme_path).expect("sidecar README");

        let bundle_name = bundle_path.file_name().unwrap().to_string_lossy();
        assert!(bundle_name.starts_with("Desclop-"));
        assert!(bundle_name.ends_with(".desclop"));
        assert!(bundle_path.is_file());
        assert_eq!(manifest.format_version, PORTABLE_BUNDLE_FORMAT_VERSION);
        assert_eq!(manifest.project.id, project_id);
        assert_eq!(
            manifest.project.git_remote.as_deref(),
            Some("git@example.com:desclop.git")
        );
        assert_eq!(manifest.plans.len(), 1);
        assert_eq!(manifest.stages.len(), 1);
        assert!(manifest.stages[0].plan_id.is_some());
        assert_eq!(manifest.tasks.len(), 1);
        assert_eq!(manifest.checklist_items.len(), 1);
        assert_eq!(manifest.notes.len(), 1);
        assert_eq!(manifest.inbox_items.len(), 1);
        assert_eq!(manifest.work_entries.len(), 1);
        assert_eq!(manifest.commits[0].sha, "abc123");
        assert_eq!(manifest.commit_task_links.len(), 1);
        assert_eq!(manifest.resume_briefs.len(), 1);
        assert!(archived_readme.contains("single-file Desclop portable backup"));
        assert!(archived_readme.contains("Keep together"));
        assert!(archived_readme.contains("Source code"));
        assert!(archived_readme.contains("Restore backup"));
        assert_eq!(sidecar_readme, archived_readme);
        assert!(!sidecar_readme.contains("/tmp/desclop-source"));
        assert!(!sidecar_readme.contains("\"formatVersion\""));
        assert_eq!(
            sidecar_readme_path.file_name().unwrap().to_string_lossy(),
            format!(
                "{}.README.md",
                bundle_path.file_stem().unwrap().to_string_lossy()
            )
        );
    }

    #[test]
    fn exported_manifest_does_not_leak_original_local_path() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("privacy");

        let bundle_path =
            export_project_bundle_to_folder(&conn, &project_id, &destination).expect("export");
        let manifest_text = read_archive_entry(&bundle_path, "manifest.json");

        assert!(!manifest_text.contains("/tmp/desclop-source"));
        assert!(!manifest_text.contains("localPath"));
    }

    #[test]
    fn export_missing_project_reports_project_context() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let destination = temp_bundle_destination("missing-project");

        let result = export_project_bundle_to_folder(&conn, "missing-project", &destination);

        assert!(result.is_err());
        let message = result.unwrap_err();
        assert!(message.contains("Failed to load project missing-project for export"));
        assert!(!message.contains("query returned no rows"));
    }

    #[test]
    fn export_creates_a_new_timestamped_bundle_without_touching_existing_backups() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("existing");
        let bundle_path = destination.join("Desclop.desclop");
        fs::create_dir_all(&bundle_path).expect("existing bundle dir");
        let stale_path = bundle_path.join("source-code.rs");
        fs::write(&stale_path, "stale source").expect("stale file");

        let result = export_project_bundle_to_folder(&conn, &project_id, &destination)
            .expect("create a new bundle");

        assert_ne!(result, bundle_path);
        assert_eq!(
            fs::read_to_string(stale_path).expect("stale file text"),
            "stale source"
        );
        assert!(!bundle_path.join("manifest.json").exists());
        assert!(result.is_file());
    }

    #[test]
    fn export_uses_sanitized_capped_folder_name_and_leaves_no_temp_sibling() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project = ProjectRepository::new(&conn)
            .create_project(
                format!("Bad?*\"<>|:/\\{}", "x".repeat(140)),
                "/tmp/desclop-source".to_string(),
                false,
            )
            .expect("create project");
        let destination = temp_bundle_destination("safe-name");

        let bundle_path =
            export_project_bundle_to_folder(&conn, &project.id, &destination).expect("export");
        let bundle_name = bundle_path
            .file_name()
            .expect("bundle name")
            .to_string_lossy()
            .to_string();
        let sibling_names: Vec<String> = fs::read_dir(&destination)
            .expect("destination entries")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();

        assert!(!bundle_name.contains('?'));
        assert!(!bundle_name.contains('*'));
        assert!(!bundle_name.contains('"'));
        assert!(!bundle_name.contains('<'));
        assert!(!bundle_name.contains('>'));
        assert!(!bundle_name.contains('|'));
        assert!(bundle_name.len() <= 140);
        assert!(sibling_names.iter().all(|name| !name.contains(".tmp-")));
    }

    #[test]
    fn export_and_import_preserve_plan_row_timestamps_and_resume_plan_order() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _stage_id, _older_task_id, _newer_task_id) =
            seed_project_with_timestamped_tasks(&mut source);
        let destination = temp_bundle_destination("timestamps");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let manifest_json: serde_json::Value =
            serde_json::from_str(&read_archive_entry(&bundle_path, "manifest.json"))
                .expect("manifest json");

        assert_eq!(
            manifest_json["stages"][0]["createdAt"],
            "2026-05-02T00:00:00Z"
        );
        assert_eq!(
            manifest_json["stages"][0]["updatedAt"],
            "2026-05-03T00:00:00Z"
        );
        assert_eq!(manifest_json["plans"].as_array().map(Vec::len), Some(1));
        assert!(manifest_json["stages"][0]["planId"].is_string());
        assert_eq!(
            manifest_json["tasks"][0]["createdAt"],
            "2026-05-04T00:00:00Z"
        );
        assert_eq!(
            manifest_json["tasks"][0]["updatedAt"],
            "2026-05-05T00:00:00Z"
        );
        assert_eq!(
            manifest_json["checklistItems"][0]["createdAt"],
            "2026-05-08T00:00:00Z"
        );
        assert_eq!(
            manifest_json["checklistItems"][0]["updatedAt"],
            "2026-05-09T00:00:00Z"
        );

        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");
        let imported_project_id =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/reselected")
                .expect("import");

        let stage_timestamps: (String, String) = target
            .query_row(
                "select created_at, updated_at from stages where project_id = ?1",
                params![imported_project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("stage timestamps");
        let older_task_timestamps: (String, String) = target
            .query_row(
                "select created_at, updated_at from tasks where project_id = ?1 and title = 'Older open task'",
                params![imported_project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("older task timestamps");
        let checklist_timestamps: (String, String) = target
            .query_row(
                "select checklist_items.created_at, checklist_items.updated_at
                 from checklist_items
                 inner join tasks on tasks.id = checklist_items.task_id
                 where tasks.project_id = ?1",
                params![imported_project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("checklist timestamps");
        let resume = crate::services::resume::build_resume_brief(&target, &imported_project_id)
            .expect("resume");
        let restored_plan_count: i64 = target
            .query_row(
                "select count(*) from plans where project_id = ?1",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("restored plan count");
        let restored_stage_has_plan: i64 = target
            .query_row(
                "select count(*) from stages where project_id = ?1 and plan_id is not null",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("restored stage plan reference");

        assert_eq!(
            stage_timestamps,
            (
                "2026-05-02T00:00:00Z".to_string(),
                "2026-05-03T00:00:00Z".to_string()
            )
        );
        assert_eq!(
            older_task_timestamps,
            (
                "2026-05-04T00:00:00Z".to_string(),
                "2026-05-05T00:00:00Z".to_string()
            )
        );
        assert_eq!(
            checklist_timestamps,
            (
                "2026-05-08T00:00:00Z".to_string(),
                "2026-05-09T00:00:00Z".to_string()
            )
        );
        assert_eq!(resume.next_step, "Keep older task waiting");
        assert_eq!(restored_plan_count, 1);
        assert_eq!(restored_stage_has_plan, 1);
    }

    #[test]
    fn import_remaps_ids_and_preserves_metadata_relationships() {
        let mut source = create_memory_connection().expect("source database");
        let (old_project_id, old_stage_id, old_task_id) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("import");
        let bundle_path = export_project_bundle_to_folder(&source, &old_project_id, &destination)
            .expect("export");
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let new_project_id =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/desclop-reselected")
                .expect("import");

        assert_ne!(new_project_id, old_project_id);
        let imported_project: crate::domain::Project = ProjectRepository::new(&target)
            .get_project(&new_project_id)
            .expect("project");
        let imported_stage_id: String = target
            .query_row(
                "select id from stages where project_id = ?1 and title = 'Foundation'",
                params![new_project_id],
                |row| row.get(0),
            )
            .expect("stage");
        let imported_task_id: String = target
            .query_row(
                "select id from tasks where project_id = ?1 and title = 'Create store'",
                params![new_project_id],
                |row| row.get(0),
            )
            .expect("task");
        let imported_plan_title: String = target
            .query_row(
                "select plans.title
                 from plans
                 inner join stages on stages.plan_id = plans.id
                 where plans.project_id = ?1 and stages.id = ?2",
                params![new_project_id, imported_stage_id],
                |row| row.get(0),
            )
            .expect("imported plan");

        assert_eq!(imported_project.local_path, "/tmp/desclop-reselected");
        assert_eq!(
            imported_project.git_remote.as_deref(),
            Some("git@example.com:desclop.git")
        );
        assert_ne!(imported_stage_id, old_stage_id);
        assert_ne!(imported_task_id, old_task_id);
        assert_eq!(imported_plan_title, "Imported plan");

        let note_task_id: String = target
            .query_row(
                "select task_id from notes where project_id = ?1",
                params![new_project_id],
                |row| row.get(0),
            )
            .expect("note task");
        let inbox_task_id: String = target
            .query_row(
                "select task_id from inbox_items where project_id = ?1",
                params![new_project_id],
                |row| row.get(0),
            )
            .expect("inbox task");
        let work_task_id: String = target
            .query_row(
                "select task_id from work_entries where project_id = ?1",
                params![new_project_id],
                |row| row.get(0),
            )
            .expect("work task");
        let link: (String, String, String) = target
            .query_row(
                "select project_id, task_id, commit_sha from commit_task_links where project_id = ?1",
                params![new_project_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("commit link");
        let brief_refs: (String, String) = target
            .query_row(
                "select task_id, stage_id from resume_briefs where project_id = ?1",
                params![new_project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("brief refs");

        assert_eq!(note_task_id, imported_task_id);
        assert_eq!(inbox_task_id, imported_task_id);
        assert_eq!(work_task_id, imported_task_id);
        assert_eq!(
            link,
            (
                new_project_id.clone(),
                imported_task_id.clone(),
                "abc123".to_string()
            )
        );
        assert_eq!(brief_refs, (imported_task_id, imported_stage_id));
    }

    #[test]
    fn restored_project_is_marked_as_recent_and_appears_first_in_the_picker() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        source
            .execute(
                "update projects set created_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z' where id = ?1",
                params![project_id],
            )
            .expect("source project timestamps");
        let destination = temp_bundle_destination("restored-project-order");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");

        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");
        let existing = ProjectRepository::new(&target)
            .create_project("Existing".to_string(), "/tmp/existing".to_string(), false)
            .expect("existing project");
        target
            .execute(
                "update projects set updated_at = '2026-01-01T00:00:00Z' where id = ?1",
                params![existing.id],
            )
            .expect("existing project timestamp");

        let imported_project_id =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/reselected")
                .expect("import");
        let restored: crate::domain::Project = ProjectRepository::new(&target)
            .get_project(&imported_project_id)
            .expect("restored project");
        let ordered = ProjectRepository::new(&target)
            .list_projects()
            .expect("ordered projects");

        assert_eq!(restored.created_at, "2020-01-01T00:00:00Z");
        assert_ne!(restored.updated_at, "2020-01-01T00:00:00Z");
        assert_eq!(
            ordered.first().map(|project| project.id.as_str()),
            Some(imported_project_id.as_str())
        );
    }

    #[test]
    fn legacy_v1_bundle_is_previewed_and_restored_as_a_single_legacy_plan() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("legacy-v1-source");
        let current_bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut legacy_bundle = read_bundle(&current_bundle_path);
        legacy_bundle.format_version = LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION;
        legacy_bundle.plans.clear();
        for stage in &mut legacy_bundle.stages {
            stage.plan_id = None;
        }
        let legacy_path = temp_bundle_destination("legacy-v1").join("Legacy.desclop");
        write_manifest(&legacy_path, &legacy_bundle);

        let preview = inspect_project_bundle_from_folder(&legacy_path).expect("legacy preview");
        assert_eq!(
            preview.format_version,
            LEGACY_PORTABLE_BUNDLE_FORMAT_VERSION
        );
        assert_eq!(preview.compatibility, "legacy_v1");
        assert_eq!(preview.plan_count, 1);
        assert_eq!(preview.task_count, 1);

        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");
        let imported_project_id =
            import_project_bundle_from_folder(&mut target, &legacy_path, "/tmp/reselected")
                .expect("legacy import");
        let restored: (String, i64) = target
            .query_row(
                "select plans.title, count(stages.id)
                 from plans
                 left join stages on stages.plan_id = plans.id
                 where plans.project_id = ?1
                 group by plans.id",
                params![imported_project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("restored legacy plan");
        assert_eq!(restored, ("Imported plan".to_string(), 1));
    }

    #[test]
    fn import_preserves_optional_null_task_and_stage_refs() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        source
            .execute(
                "insert into notes (id, project_id, task_id, body, created_at)
                 values ('project-note', ?1, null, 'Project note', '2026-05-21T10:00:00Z')",
                params![project_id],
            )
            .expect("project note");
        source
            .execute(
                "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
                 values ('project-inbox', ?1, null, 'Project inbox', 'note', 'open', '2026-05-21T10:01:00Z', '2026-05-21T10:02:00Z')",
                params![project_id],
            )
            .expect("project inbox");
        source
            .execute(
                "insert into work_entries (id, project_id, task_id, source, done, remains, next_step, created_at)
                 values ('project-work', ?1, null, 'manual', 'Project done', '', '', '2026-05-21T10:03:00Z')",
                params![project_id],
            )
            .expect("project work");
        source
            .execute(
                "insert into resume_briefs (id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at)
                 values ('project-brief', ?1, null, null, '', 'Choose a task', '[]', '2026-05-21T10:04:00Z')",
                params![project_id],
            )
            .expect("project brief");
        let destination = temp_bundle_destination("null-refs");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let imported_project_id =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/reselected")
                .expect("import");

        let null_note_refs: i64 = target
            .query_row(
                "select count(*) from notes where project_id = ?1 and body = 'Project note' and task_id is null",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("note refs");
        let null_inbox_refs: i64 = target
            .query_row(
                "select count(*) from inbox_items where project_id = ?1 and body = 'Project inbox' and task_id is null",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("inbox refs");
        let null_work_refs: i64 = target
            .query_row(
                "select count(*) from work_entries where project_id = ?1 and done = 'Project done' and task_id is null",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("work refs");
        let null_resume_refs: i64 = target
            .query_row(
                "select count(*) from resume_briefs where project_id = ?1 and next_step = 'Choose a task' and task_id is null and stage_id is null",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("resume refs");

        assert_eq!(null_note_refs, 1);
        assert_eq!(null_inbox_refs, 1);
        assert_eq!(null_work_refs, 1);
        assert_eq!(null_resume_refs, 1);
    }

    #[test]
    fn import_remaps_active_task_id_to_imported_task() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, task_id) = seed_full_project(&mut source);
        source
            .execute(
                "update projects set active_task_id = ?1 where id = ?2",
                params![task_id, project_id],
            )
            .expect("active task");
        let destination = temp_bundle_destination("active-task");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let imported_project_id =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/reselected")
                .expect("import");

        let active_task_id: String = target
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![imported_project_id],
                |row| row.get(0),
            )
            .expect("active task id");
        let active_task_project_id: String = target
            .query_row(
                "select project_id from tasks where id = ?1",
                params![active_task_id],
                |row| row.get(0),
            )
            .expect("active task project");

        assert_eq!(active_task_project_id, imported_project_id);
        assert_ne!(active_task_id, task_id);
    }

    #[test]
    fn import_rejects_unsupported_bundle_format_version() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("bad-version");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut manifest: serde_json::Value =
            serde_json::from_str(&read_archive_entry(&bundle_path, "manifest.json"))
                .expect("manifest json");
        manifest["formatVersion"] = serde_json::json!(999);
        let malformed_path = temp_bundle_destination("bad-version-result").join("Bad.desclop");
        fs::create_dir_all(&malformed_path).expect("legacy bundle dir");
        fs::write(
            malformed_path.join("manifest.json"),
            serde_json::to_string_pretty(&manifest).expect("manifest json"),
        )
        .expect("write legacy manifest");
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Unsupported bundle format version 999"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn malformed_relationship_fails_import_and_rolls_back_partial_project() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("bad-relationship-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.checklist_items[0].task_id = "missing-task".to_string();
        let malformed_path = temp_bundle_destination("bad-relationship").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing task for checklist item"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn duplicate_stage_ids_fail_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("duplicate-stage-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.stages.push(BundleStageRow {
            id: bundle.stages[0].id.clone(),
            project_id: bundle.project.id.clone(),
            plan_id: bundle.stages[0].plan_id.clone(),
            title: "Duplicate".to_string(),
            description: "".to_string(),
            position: 1,
            status: "future".to_string(),
            created_at: "2026-05-22T10:00:00Z".to_string(),
            updated_at: "2026-05-22T10:00:00Z".to_string(),
        });
        let malformed_path = temp_bundle_destination("duplicate-stage").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Duplicate stage id"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn duplicate_task_ids_fail_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("duplicate-task-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        let mut duplicate = bundle.tasks[0].clone();
        duplicate.title = "Duplicate task".to_string();
        bundle.tasks.push(duplicate);
        let malformed_path = temp_bundle_destination("duplicate-task").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Duplicate task id"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn wrong_row_project_id_fails_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("wrong-project-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.tasks[0].project_id = "other-project".to_string();
        let malformed_path = temp_bundle_destination("wrong-project").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("task projectId does not match bundle project"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn missing_task_stage_ref_fails_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("missing-stage-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.tasks[0].stage_id = "missing-stage".to_string();
        let malformed_path = temp_bundle_destination("missing-stage").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing stage for task"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn missing_active_task_ref_fails_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("missing-active-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.project.active_task_id = Some("missing-active-task".to_string());
        let malformed_path = temp_bundle_destination("missing-active").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing active task"));
        assert_eq!(project_count(&target), 0);
    }

    #[test]
    fn missing_commit_link_refs_fail_validation_before_insert() {
        let mut source = create_memory_connection().expect("source database");
        let (project_id, _, _) = seed_full_project(&mut source);
        let destination = temp_bundle_destination("missing-commit-source");
        let bundle_path =
            export_project_bundle_to_folder(&source, &project_id, &destination).expect("export");
        let mut bundle = read_bundle(&bundle_path);
        bundle.commit_task_links[0].commit_sha = "missing-sha".to_string();
        let malformed_path = temp_bundle_destination("missing-commit").join("Bad.desclop");
        write_manifest(&malformed_path, &bundle);
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &malformed_path, "/tmp/reselected");

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing commit for commit task link"));
        assert_eq!(project_count(&target), 0);
    }
}

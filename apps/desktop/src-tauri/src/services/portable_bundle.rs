use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{CommitTaskLink, GitCommit, InboxItem, Note, ResumeBrief, WorkEntry};
use crate::repositories::projects::ProjectRepository;

pub const PORTABLE_BUNDLE_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableProjectBundle {
    pub format_version: u32,
    pub exported_at: String,
    pub project: BundleProjectRow,
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
    pub title: String,
    pub description: String,
    pub position: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
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
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleChecklistItemRow {
    pub id: String,
    pub task_id: String,
    pub title: String,
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
        "{}.desclop",
        bundle_folder_name(&bundle.project.name)
    ));
    if bundle_path.exists() {
        return Err(format!(
            "Portable bundle directory already exists: {}",
            bundle_path.display()
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

    let result = write_project_bundle_temp_then_rename(bundle, &temp_path, &bundle_path);
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&temp_path);
    }
    result
}

fn write_project_bundle_temp_then_rename(
    bundle: &PortableProjectBundle,
    temp_path: &Path,
    bundle_path: &Path,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(temp_path).map_err(|err| {
        format!(
            "Failed to create bundle directory {}: {err}",
            temp_path.display()
        )
    })?;
    let manifest_json = serde_json::to_string_pretty(&bundle).map_err(|err| err.to_string())?;
    std::fs::write(temp_path.join("manifest.json"), manifest_json).map_err(|err| {
        format!(
            "Failed to write {}: {err}",
            temp_path.join("manifest.json").display()
        )
    })?;
    std::fs::write(
        temp_path.join("README.md"),
        bundle_readme(&bundle.project.name),
    )
    .map_err(|err| {
        format!(
            "Failed to write {}: {err}",
            temp_path.join("README.md").display()
        )
    })?;
    std::fs::rename(temp_path, bundle_path)
        .map_err(|err| format!("Failed to finalize bundle {}: {err}", bundle_path.display()))?;

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

    let bundle = read_project_bundle_from_folder(bundle_folder.as_ref())?;

    import_project_bundle(conn, bundle, reselected_local_path, bundle_folder.as_ref())
}

pub fn read_project_bundle_from_folder(
    bundle_folder: impl AsRef<Path>,
) -> Result<PortableProjectBundle, String> {
    let bundle_folder = bundle_folder.as_ref();
    let manifest_path = bundle_folder.join("manifest.json");
    let manifest_json = std::fs::read_to_string(&manifest_path).map_err(|err| {
        format!(
            "Failed to read bundle manifest {}: {err}",
            manifest_path.display()
        )
    })?;
    let bundle: PortableProjectBundle = serde_json::from_str(&manifest_json).map_err(|err| {
        format!(
            "Failed to parse bundle manifest {}: {err}",
            manifest_path.display()
        )
    })?;

    if bundle.format_version != PORTABLE_BUNDLE_FORMAT_VERSION {
        return Err(format!(
            "Unsupported bundle format version {}",
            bundle.format_version
        ));
    }

    validate_bundle_integrity(&bundle)?;
    Ok(bundle)
}

pub fn import_project_bundle(
    conn: &mut Connection,
    bundle: PortableProjectBundle,
    reselected_local_path: &str,
    bundle_folder: impl AsRef<Path>,
) -> Result<String, String> {
    if reselected_local_path.trim().is_empty() {
        return Err("Project folder is required".to_string());
    }

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
            bundle.project.updated_at
        ],
    )?;

    for stage in bundle.stages {
        let new_stage_id = Uuid::new_v4().to_string();
        stage_ids.insert(stage.id.clone(), new_stage_id.clone());
        tx.execute(
            "insert into stages (id, project_id, title, description, position, status, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                new_stage_id,
                new_project_id,
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
            "insert into tasks (id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                task.updated_at
            ],
        )?;
    }

    for item in bundle.checklist_items {
        tx.execute(
            "insert into checklist_items (id, task_id, title, completed, position, created_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                remap_required(&task_ids, &item.task_id, "task_id")?,
                item.title,
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

fn list_stage_rows(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<BundleStageRow>> {
    let mut stmt = conn.prepare(
        "select id, project_id, title, description, position, status, created_at, updated_at
         from stages
         where project_id = ?1
         order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(BundleStageRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            position: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

fn list_task_rows(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<BundleTaskRow>> {
    let mut stmt = conn.prepare(
        "select id, project_id, stage_id, title, description, status, priority, due_date, next_step, position, created_at, updated_at
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
                checklist_items.completed, checklist_items.position,
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
            completed: row.get::<_, i32>(3)? == 1,
            position: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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

fn bundle_readme(project_name: &str) -> String {
    format!(
        "# {project_name} Desclop Bundle\n\nThis portable bundle contains Desclop project planning data only. Source code is not copied.\n\nAfter import, reselect the local project folder so Desclop can reconnect the imported plan to source files and Git history on this computer.\n"
    )
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
                        status: "todo".to_string(),
                        checklist: vec![ImportChecklistItem {
                            title: "Add migration".to_string(),
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
                            status: "todo".to_string(),
                            checklist: vec![ImportChecklistItem {
                                title: "Timed checklist".to_string(),
                                completed: false,
                                position: 0,
                            }],
                            position: 0,
                        },
                        ImportTask {
                            title: "Newer open task".to_string(),
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
        serde_json::from_str(
            &fs::read_to_string(bundle_path.join("manifest.json")).expect("manifest text"),
        )
        .expect("manifest json")
    }

    fn project_count(conn: &rusqlite::Connection) -> i64 {
        conn.query_row("select count(*) from projects", [], |row| row.get(0))
            .expect("project count")
    }

    #[test]
    fn export_writes_manifest_and_readme_folder_bundle() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("export");

        let bundle_path =
            export_project_bundle_to_folder(&conn, &project_id, &destination).expect("export");

        let manifest_path = bundle_path.join("manifest.json");
        let readme_path = bundle_path.join("README.md");
        let manifest: PortableProjectBundle =
            serde_json::from_str(&fs::read_to_string(manifest_path).expect("manifest text"))
                .expect("manifest json");
        let readme = fs::read_to_string(readme_path).expect("readme text");

        assert_eq!(bundle_path.file_name().unwrap(), "Desclop.desclop");
        assert_eq!(manifest.format_version, 1);
        assert_eq!(manifest.project.id, project_id);
        assert_eq!(
            manifest.project.git_remote.as_deref(),
            Some("git@example.com:desclop.git")
        );
        assert_eq!(manifest.stages.len(), 1);
        assert_eq!(manifest.tasks.len(), 1);
        assert_eq!(manifest.checklist_items.len(), 1);
        assert_eq!(manifest.notes.len(), 1);
        assert_eq!(manifest.inbox_items.len(), 1);
        assert_eq!(manifest.work_entries.len(), 1);
        assert_eq!(manifest.commits[0].sha, "abc123");
        assert_eq!(manifest.commit_task_links.len(), 1);
        assert_eq!(manifest.resume_briefs.len(), 1);
        assert!(readme.contains("Source code is not copied"));
        assert!(readme.contains("reselect the local project folder"));
    }

    #[test]
    fn exported_manifest_does_not_leak_original_local_path() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("privacy");

        let bundle_path =
            export_project_bundle_to_folder(&conn, &project_id, &destination).expect("export");
        let manifest_text =
            fs::read_to_string(bundle_path.join("manifest.json")).expect("manifest text");

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
    fn export_rejects_existing_bundle_directory_and_leaves_stale_files_untouched() {
        let mut conn = create_memory_connection().expect("memory database");
        let (project_id, _, _) = seed_full_project(&mut conn);
        let destination = temp_bundle_destination("existing");
        let bundle_path = destination.join("Desclop.desclop");
        fs::create_dir_all(&bundle_path).expect("existing bundle dir");
        let stale_path = bundle_path.join("source-code.rs");
        fs::write(&stale_path, "stale source").expect("stale file");

        let result = export_project_bundle_to_folder(&conn, &project_id, &destination);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("bundle directory already exists"));
        assert_eq!(
            fs::read_to_string(stale_path).expect("stale file text"),
            "stale source"
        );
        assert!(!bundle_path.join("manifest.json").exists());
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
        assert!(bundle_name.len() <= 90);
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
        let manifest_json: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(bundle_path.join("manifest.json")).expect("manifest text"),
        )
        .expect("manifest json");

        assert_eq!(
            manifest_json["stages"][0]["createdAt"],
            "2026-05-02T00:00:00Z"
        );
        assert_eq!(
            manifest_json["stages"][0]["updatedAt"],
            "2026-05-03T00:00:00Z"
        );
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

        assert_eq!(imported_project.local_path, "/tmp/desclop-reselected");
        assert_eq!(
            imported_project.git_remote.as_deref(),
            Some("git@example.com:desclop.git")
        );
        assert_ne!(imported_stage_id, old_stage_id);
        assert_ne!(imported_task_id, old_task_id);

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
        let mut manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(bundle_path.join("manifest.json")).expect("manifest text"),
        )
        .expect("manifest json");
        manifest["formatVersion"] = serde_json::json!(999);
        fs::write(
            bundle_path.join("manifest.json"),
            serde_json::to_string_pretty(&manifest).expect("manifest json"),
        )
        .expect("write manifest");
        let mut target = create_memory_connection().expect("target database");
        run_migrations(&target).expect("target migrations");

        let result =
            import_project_bundle_from_folder(&mut target, &bundle_path, "/tmp/reselected");

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
        let mut bundle: PortableProjectBundle = serde_json::from_str(
            &fs::read_to_string(bundle_path.join("manifest.json")).expect("manifest text"),
        )
        .expect("manifest json");
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

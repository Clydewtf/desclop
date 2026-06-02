use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{CommitTaskLink, GitCommit, InboxItem, Note, ResumeBrief, WorkEntry};
use crate::repositories::projects::ProjectRepository;
use crate::repositories::tasks::TaskRepository;

pub const PORTABLE_BUNDLE_FORMAT_VERSION: u32 = 1;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableProjectBundle {
    pub format_version: u32,
    pub exported_at: String,
    pub project: crate::domain::Project,
    pub stages: Vec<crate::domain::Stage>,
    pub tasks: Vec<crate::domain::Task>,
    pub checklist_items: Vec<crate::domain::ChecklistItem>,
    pub notes: Vec<crate::domain::Note>,
    pub inbox_items: Vec<crate::domain::InboxItem>,
    pub work_entries: Vec<crate::domain::WorkEntry>,
    pub commits: Vec<crate::domain::GitCommit>,
    pub commit_task_links: Vec<crate::domain::CommitTaskLink>,
    pub resume_briefs: Vec<crate::domain::ResumeBrief>,
}

pub fn export_project_bundle_to_folder(
    conn: &Connection,
    project_id: &str,
    destination_folder: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let bundle = load_project_bundle(conn, project_id).map_err(|err| err.to_string())?;
    let bundle_path = destination_folder.as_ref().join(format!(
        "{}.desclop",
        bundle_folder_name(&bundle.project.name)
    ));

    std::fs::create_dir_all(&bundle_path).map_err(|err| err.to_string())?;
    let manifest_json = serde_json::to_string_pretty(&bundle).map_err(|err| err.to_string())?;
    std::fs::write(bundle_path.join("manifest.json"), manifest_json)
        .map_err(|err| err.to_string())?;
    std::fs::write(
        bundle_path.join("README.md"),
        bundle_readme(&bundle.project.name),
    )
    .map_err(|err| err.to_string())?;

    Ok(bundle_path)
}

pub fn import_project_bundle_from_folder(
    conn: &mut Connection,
    bundle_folder: impl AsRef<Path>,
    reselected_local_path: &str,
) -> Result<String, String> {
    if reselected_local_path.trim().is_empty() {
        return Err("Project folder is required".to_string());
    }

    let manifest_path = bundle_folder.as_ref().join("manifest.json");
    let manifest_json = std::fs::read_to_string(manifest_path).map_err(|err| err.to_string())?;
    let bundle: PortableProjectBundle =
        serde_json::from_str(&manifest_json).map_err(|err| err.to_string())?;

    if bundle.format_version != PORTABLE_BUNDLE_FORMAT_VERSION {
        return Err(format!(
            "Unsupported bundle format version {}",
            bundle.format_version
        ));
    }

    import_bundle(conn, bundle, reselected_local_path).map_err(|err| err.to_string())
}

fn load_project_bundle(
    conn: &Connection,
    project_id: &str,
) -> rusqlite::Result<PortableProjectBundle> {
    let project = ProjectRepository::new(conn).get_project(project_id)?;
    let task_repository = TaskRepository::new(conn);

    Ok(PortableProjectBundle {
        format_version: PORTABLE_BUNDLE_FORMAT_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        stages: task_repository.list_stages(project_id)?,
        tasks: task_repository.list_tasks(project_id)?,
        checklist_items: task_repository.list_checklist_items(project_id)?,
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
                bundle.project.created_at,
                bundle.project.updated_at
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
                bundle.project.created_at,
                bundle.project.updated_at
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
                bundle.project.created_at,
                bundle.project.updated_at
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
            '/' | '\\' | ':' => '_',
            character => character,
        })
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "project".to_string()
    } else {
        trimmed.to_string()
    }
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
}

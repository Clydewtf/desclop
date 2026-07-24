use chrono::{DateTime, FixedOffset};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::domain::GitCommit;
use crate::repositories::work_entries::WorkEntryRepository;
use crate::services::git_adapter::GitCommitMetadata;

#[allow(dead_code)]
#[derive(Debug, PartialEq, Eq)]
pub enum LinkDecision {
    FocusInterval { task_id: String },
    ActiveTask { task_id: String },
    NoLink,
}

#[allow(dead_code)]
pub fn decide_link(
    committed_at: &str,
    focus_started_at: Option<&str>,
    focus_ended_at: Option<&str>,
    focus_task_id: Option<&str>,
    active_task_id: Option<&str>,
) -> LinkDecision {
    if let (Some(started), Some(ended), Some(task_id)) =
        (focus_started_at, focus_ended_at, focus_task_id)
    {
        if is_inside_interval(committed_at, started, ended) {
            return LinkDecision::FocusInterval {
                task_id: task_id.to_string(),
            };
        }
    }

    match active_task_id {
        Some(task_id) => LinkDecision::ActiveTask {
            task_id: task_id.to_string(),
        },
        None => LinkDecision::NoLink,
    }
}

fn is_inside_interval(committed_at: &str, started_at: &str, ended_at: &str) -> bool {
    let parsed = (
        DateTime::parse_from_rfc3339(committed_at),
        DateTime::parse_from_rfc3339(started_at),
        DateTime::parse_from_rfc3339(ended_at),
    );
    match parsed {
        (Ok(committed), Ok(started), Ok(ended)) => {
            let committed: DateTime<FixedOffset> = committed;
            committed >= started && committed <= ended
        }
        _ => false,
    }
}

pub fn sync_commits(
    conn: &Connection,
    project_id: &str,
    commits: Vec<GitCommitMetadata>,
) -> rusqlite::Result<Vec<GitCommit>> {
    let active_task_id = load_active_task_id(conn, project_id)?;
    let mut synced_commits = Vec::new();

    for commit in commits {
        let changed_files_json =
            serde_json::to_string(&commit.changed_files).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(project_id, sha) do update set
               message = excluded.message,
               author_name = excluded.author_name,
               committed_at = excluded.committed_at,
               changed_files_json = case
                 when excluded.changed_files_json = '[]' and commits.changed_files_json != '[]'
                 then commits.changed_files_json
                 else excluded.changed_files_json
               end",
            params![
                &commit.sha,
                project_id,
                &commit.branch,
                &commit.message,
                &commit.author_name,
                &commit.committed_at,
                &changed_files_json
            ],
        )?;
        let changed_files = load_changed_files(conn, project_id, &commit.sha)?;
        let branch = load_branch(conn, project_id, &commit.sha)?;

        if !has_link_for_commit(conn, project_id, &commit.sha)? {
            let focus_interval = WorkEntryRepository::new(conn)
                .focus_interval_containing_commit(project_id, &commit.committed_at)?;
            let decision = match focus_interval {
                Some((task_id, started_at, ended_at)) => decide_link(
                    &commit.committed_at,
                    Some(&started_at),
                    Some(&ended_at),
                    Some(&task_id),
                    active_task_id.as_deref(),
                ),
                None => decide_link(
                    &commit.committed_at,
                    None,
                    None,
                    None,
                    active_task_id.as_deref(),
                ),
            };
            insert_link_decision(conn, project_id, &commit.sha, decision)?;
        }

        synced_commits.push(GitCommit {
            sha: commit.sha,
            project_id: project_id.to_string(),
            branch,
            message: commit.message,
            author_name: commit.author_name,
            committed_at: commit.committed_at,
            changed_files,
        });
    }

    Ok(synced_commits)
}

fn load_branch(conn: &Connection, project_id: &str, sha: &str) -> rusqlite::Result<String> {
    conn.query_row(
        "select branch from commits where project_id = ?1 and sha = ?2",
        params![project_id, sha],
        |row| row.get(0),
    )
}

fn load_changed_files(
    conn: &Connection,
    project_id: &str,
    sha: &str,
) -> rusqlite::Result<Vec<String>> {
    let changed_files_json: String = conn.query_row(
        "select changed_files_json from commits where project_id = ?1 and sha = ?2",
        params![project_id, sha],
        |row| row.get(0),
    )?;

    Ok(serde_json::from_str(&changed_files_json).unwrap_or_default())
}

pub fn list_linked_commits_for_task(
    conn: &Connection,
    project_id: &str,
    task_id: &str,
) -> rusqlite::Result<Vec<GitCommit>> {
    let mut stmt = conn.prepare(
        "select commits.sha, commits.project_id, commits.branch, commits.message, commits.author_name,
                commits.committed_at, commits.changed_files_json
         from commits
         inner join commit_task_links on commit_task_links.commit_sha = commits.sha
         where commits.project_id = ?1
           and commit_task_links.project_id = ?1
           and commit_task_links.task_id = ?2
         order by commits.committed_at desc, commits.sha asc",
    )?;

    let rows = stmt.query_map(params![project_id, task_id], |row| {
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

fn load_active_task_id(conn: &Connection, project_id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "select active_task_id from projects where id = ?1",
        params![project_id],
        |row| row.get(0),
    )
    .optional()
    .map(|active_task_id| active_task_id.flatten())
}

fn has_link_for_commit(
    conn: &Connection,
    project_id: &str,
    commit_sha: &str,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "select 1 from commit_task_links where project_id = ?1 and commit_sha = ?2 limit 1",
        params![project_id, commit_sha],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
}

fn insert_link_decision(
    conn: &Connection,
    project_id: &str,
    commit_sha: &str,
    decision: LinkDecision,
) -> rusqlite::Result<()> {
    let (task_id, link_mode) = match decision {
        LinkDecision::FocusInterval { task_id } => (task_id, "focus_interval"),
        LinkDecision::ActiveTask { task_id } => (task_id, "active_task"),
        LinkDecision::NoLink => return Ok(()),
    };

    conn.execute(
        "insert or ignore into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
         values (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            project_id,
            task_id,
            commit_sha,
            link_mode,
            chrono::Utc::now().to_rfc3339()
        ],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::domain::CreateWorkEntryInput;
    use crate::repositories::plans::{ImportStage, ImportTask, PlanRepository};
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::tasks::TaskRepository;
    use crate::repositories::work_entries::WorkEntryRepository;

    fn seed_project_with_tasks(conn: &mut Connection) -> (String, String, String) {
        let project = ProjectRepository::new(conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), true)
            .expect("create project");

        PlanRepository::new(conn)
            .replace_plan(
                &project.id,
                vec![ImportStage {
                    title: "Foundation".to_string(),
                    description: "".to_string(),
                    position: 0,
                    tasks: vec![
                        ImportTask {
                            title: "Focused task".to_string(),
                            description: "".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 0,
                        },
                        ImportTask {
                            title: "Active task".to_string(),
                            description: "".to_string(),
                            status: "todo".to_string(),
                            checklist: vec![],
                            position: 1,
                        },
                    ],
                }],
            )
            .expect("replace plan");

        let tasks = TaskRepository::new(conn)
            .list_tasks(&project.id)
            .expect("list tasks");
        let focused_task_id = tasks[0].id.clone();
        let active_task_id = tasks[1].id.clone();
        TaskRepository::new(conn)
            .set_active_task(&project.id, &active_task_id)
            .expect("set active task");

        (project.id, focused_task_id, active_task_id)
    }

    fn commit(sha: &str, committed_at: &str) -> GitCommitMetadata {
        GitCommitMetadata {
            sha: sha.to_string(),
            branch: "main".to_string(),
            message: format!("Commit {sha}"),
            author_name: "Clyde".to_string(),
            committed_at: committed_at.to_string(),
            changed_files: vec!["src/main.ts".to_string()],
        }
    }

    fn commit_with_changed_files(
        sha: &str,
        committed_at: &str,
        changed_files: Vec<String>,
    ) -> GitCommitMetadata {
        GitCommitMetadata {
            sha: sha.to_string(),
            branch: "main".to_string(),
            message: format!("Commit {sha}"),
            author_name: "Clyde".to_string(),
            committed_at: committed_at.to_string(),
            changed_files,
        }
    }

    #[test]
    fn prefers_matching_focus_interval() {
        assert_eq!(
            decide_link(
                "2026-05-20T10:10:00Z",
                Some("2026-05-20T10:00:00Z"),
                Some("2026-05-20T10:30:00Z"),
                Some("t1"),
                Some("t2")
            ),
            LinkDecision::FocusInterval {
                task_id: "t1".to_string()
            }
        );
    }

    #[test]
    fn falls_back_to_active_task() {
        assert_eq!(
            decide_link("2026-05-20T11:00:00Z", None, None, None, Some("t1")),
            LinkDecision::ActiveTask {
                task_id: "t1".to_string()
            }
        );
    }

    #[test]
    fn parses_rfc3339_timestamps_for_focus_interval() {
        assert_eq!(
            decide_link(
                "2026-05-20T10:10:00Z",
                Some("2026-05-20T12:00:00+02:00"),
                Some("2026-05-20T12:30:00+02:00"),
                Some("focus-task"),
                Some("active-task")
            ),
            LinkDecision::FocusInterval {
                task_id: "focus-task".to_string()
            }
        );
    }

    #[test]
    fn invalid_focus_timestamps_fall_back_to_active_task() {
        assert_eq!(
            decide_link(
                "not-a-date",
                Some("2026-05-20T10:00:00Z"),
                Some("zzzz"),
                Some("focus-task"),
                Some("active-task")
            ),
            LinkDecision::ActiveTask {
                task_id: "active-task".to_string()
            }
        );
    }

    #[test]
    fn sync_commits_auto_links_focus_interval_before_active_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, focused_task_id, _active_task_id) = seed_project_with_tasks(&mut conn);
        WorkEntryRepository::new(&conn)
            .create_work_entry(CreateWorkEntryInput {
                project_id: project_id.clone(),
                task_id: Some(focused_task_id.clone()),
                source: "focus".to_string(),
                started_at: Some("2026-05-20T10:00:00Z".to_string()),
                ended_at: Some("2026-05-20T10:30:00Z".to_string()),
                duration_seconds: Some(1800),
                done: "Focused".to_string(),
                remains: "".to_string(),
                next_step: "".to_string(),
            })
            .expect("create focus entry");

        sync_commits(
            &conn,
            &project_id,
            vec![commit("abc123", "2026-05-20T10:10:00Z")],
        )
        .expect("sync commits");

        let linked = list_linked_commits_for_task(&conn, &project_id, &focused_task_id)
            .expect("linked commits");
        let link_mode: String = conn
            .query_row(
                "select link_mode from commit_task_links where commit_sha = 'abc123'",
                [],
                |row| row.get(0),
            )
            .expect("link mode");
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].sha, "abc123");
        assert_eq!(linked[0].changed_files, vec!["src/main.ts".to_string()]);
        assert_eq!(link_mode, "focus_interval");
    }

    #[test]
    fn sync_commits_preserves_existing_manual_links() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, focused_task_id, active_task_id) = seed_project_with_tasks(&mut conn);
        conn.execute(
            "insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values ('abc123', ?1, 'main', 'Manual link', 'Clyde', '2026-05-20T09:00:00Z', '[]')",
            params![project_id],
        )
        .expect("insert commit");
        conn.execute(
            "insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link-1', ?1, ?2, 'abc123', 'manual', '2026-05-20T09:01:00Z')",
            params![project_id, focused_task_id],
        )
        .expect("insert link");

        sync_commits(
            &conn,
            &project_id,
            vec![commit("abc123", "2026-05-20T11:00:00Z")],
        )
        .expect("sync commits");

        let linked_to_focused = list_linked_commits_for_task(&conn, &project_id, &focused_task_id)
            .expect("focused links");
        let linked_to_active = list_linked_commits_for_task(&conn, &project_id, &active_task_id)
            .expect("active links");
        let link_mode: String = conn
            .query_row(
                "select link_mode from commit_task_links where commit_sha = 'abc123'",
                [],
                |row| row.get(0),
            )
            .expect("link mode");
        assert_eq!(linked_to_focused.len(), 1);
        assert_eq!(linked_to_active.len(), 0);
        assert_eq!(link_mode, "manual");
    }

    #[test]
    fn sync_commits_does_not_overwrite_existing_changed_files_with_empty_metadata() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, _focused_task_id, _active_task_id) = seed_project_with_tasks(&mut conn);

        sync_commits(
            &conn,
            &project_id,
            vec![commit_with_changed_files(
                "abc123",
                "2026-05-20T10:10:00Z",
                vec!["src/main.ts".to_string()],
            )],
        )
        .expect("initial sync");
        let synced = sync_commits(
            &conn,
            &project_id,
            vec![commit_with_changed_files(
                "abc123",
                "2026-05-20T10:10:00Z",
                vec![],
            )],
        )
        .expect("second sync");

        let stored_changed_files_json: String = conn
            .query_row(
                "select changed_files_json from commits where project_id = ?1 and sha = 'abc123'",
                params![project_id],
                |row| row.get(0),
            )
            .expect("stored changed files");
        assert_eq!(stored_changed_files_json, "[\"src/main.ts\"]");
        assert_eq!(synced[0].changed_files, vec!["src/main.ts".to_string()]);
    }

    #[test]
    fn sync_commits_preserves_first_seen_branch_for_existing_commit() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, _focused_task_id, _active_task_id) = seed_project_with_tasks(&mut conn);

        sync_commits(
            &conn,
            &project_id,
            vec![GitCommitMetadata {
                sha: "abc123".to_string(),
                branch: "work-t3".to_string(),
                message: "Implement timeline context".to_string(),
                author_name: "Clyde".to_string(),
                committed_at: "2026-05-20T10:10:00Z".to_string(),
                changed_files: vec!["src/main.ts".to_string()],
            }],
        )
        .expect("initial sync");
        let synced = sync_commits(
            &conn,
            &project_id,
            vec![GitCommitMetadata {
                sha: "abc123".to_string(),
                branch: "main".to_string(),
                message: "Implement timeline context".to_string(),
                author_name: "Clyde".to_string(),
                committed_at: "2026-05-20T10:10:00Z".to_string(),
                changed_files: vec!["src/main.ts".to_string()],
            }],
        )
        .expect("second sync");

        let stored_branch: String = conn
            .query_row(
                "select branch from commits where project_id = ?1 and sha = 'abc123'",
                params![project_id],
                |row| row.get(0),
            )
            .expect("stored branch");
        assert_eq!(stored_branch, "work-t3");
        assert_eq!(synced[0].branch, "work-t3");
    }

    #[test]
    fn sync_commits_keeps_same_sha_scoped_to_each_project() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (first_project_id, _first_focused_task_id, first_active_task_id) =
            seed_project_with_tasks(&mut conn);
        let (second_project_id, _second_focused_task_id, second_active_task_id) =
            seed_project_with_tasks(&mut conn);

        sync_commits(
            &conn,
            &first_project_id,
            vec![commit("shared-sha", "2026-05-20T11:00:00Z")],
        )
        .expect("sync first project");
        sync_commits(
            &conn,
            &second_project_id,
            vec![commit("shared-sha", "2026-05-20T11:00:00Z")],
        )
        .expect("sync second project");

        let first_links =
            list_linked_commits_for_task(&conn, &first_project_id, &first_active_task_id)
                .expect("first links");
        let second_links =
            list_linked_commits_for_task(&conn, &second_project_id, &second_active_task_id)
                .expect("second links");
        let commit_count: i64 = conn
            .query_row(
                "select count(*) from commits where sha = 'shared-sha'",
                [],
                |row| row.get(0),
            )
            .expect("commit count");

        assert_eq!(first_links.len(), 1);
        assert_eq!(second_links.len(), 1);
        assert_eq!(commit_count, 2);
    }

    #[test]
    fn sync_commits_matches_focus_interval_with_rfc3339_offsets() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, focused_task_id, _active_task_id) = seed_project_with_tasks(&mut conn);
        WorkEntryRepository::new(&conn)
            .create_work_entry(CreateWorkEntryInput {
                project_id: project_id.clone(),
                task_id: Some(focused_task_id.clone()),
                source: "focus".to_string(),
                started_at: Some("2026-05-20T12:00:00+02:00".to_string()),
                ended_at: Some("2026-05-20T12:30:00+02:00".to_string()),
                duration_seconds: Some(1800),
                done: "Focused".to_string(),
                remains: "".to_string(),
                next_step: "".to_string(),
            })
            .expect("create focus entry");

        sync_commits(
            &conn,
            &project_id,
            vec![commit("abc123", "2026-05-20T10:10:00Z")],
        )
        .expect("sync commits");

        let linked = list_linked_commits_for_task(&conn, &project_id, &focused_task_id)
            .expect("linked commits");
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].sha, "abc123");
    }

    #[test]
    fn sync_commits_checks_focus_intervals_beyond_newest_twenty_five() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let (project_id, focused_task_id, _active_task_id) = seed_project_with_tasks(&mut conn);
        let repository = WorkEntryRepository::new(&conn);
        repository
            .create_work_entry(CreateWorkEntryInput {
                project_id: project_id.clone(),
                task_id: Some(focused_task_id.clone()),
                source: "focus".to_string(),
                started_at: Some("2026-05-20T10:00:00Z".to_string()),
                ended_at: Some("2026-05-20T10:30:00Z".to_string()),
                duration_seconds: Some(1800),
                done: "Matching focus".to_string(),
                remains: "".to_string(),
                next_step: "".to_string(),
            })
            .expect("create matching focus entry");
        for index in 0..30 {
            let day = if index < 24 { 21 } else { 22 };
            let hour = if index < 24 { index } else { index - 24 };
            repository
                .create_work_entry(CreateWorkEntryInput {
                    project_id: project_id.clone(),
                    task_id: Some(focused_task_id.clone()),
                    source: "focus".to_string(),
                    started_at: Some(format!("2026-05-{day:02}T{hour:02}:00:00Z")),
                    ended_at: Some(format!("2026-05-{day:02}T{hour:02}:30:00Z")),
                    duration_seconds: Some(1800),
                    done: "Non-matching focus".to_string(),
                    remains: "".to_string(),
                    next_step: "".to_string(),
                })
                .expect("create non-matching focus entry");
        }

        sync_commits(
            &conn,
            &project_id,
            vec![commit("abc123", "2026-05-20T10:10:00Z")],
        )
        .expect("sync commits");

        let linked = list_linked_commits_for_task(&conn, &project_id, &focused_task_id)
            .expect("linked commits");
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].sha, "abc123");
    }
}

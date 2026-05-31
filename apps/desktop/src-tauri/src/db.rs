use rusqlite::Connection;

pub fn create_memory_connection() -> rusqlite::Result<Connection> {
    Connection::open_in_memory()
}

pub fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    Connection::open(path)
}

pub fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(include_str!("../migrations/001_init.sql"))?;
    migrate_commit_tables_to_project_scoped_keys(conn)
}

fn migrate_commit_tables_to_project_scoped_keys(conn: &Connection) -> rusqlite::Result<()> {
    if commits_are_project_scoped(conn)? {
        return Ok(());
    }

    conn.execute_batch(
        "pragma foreign_keys = off;

         alter table commit_task_links rename to commit_task_links_old;
         alter table commits rename to commits_old;

         create table commits (
           project_id text not null references projects(id) on delete cascade,
           sha text not null,
           branch text not null,
           message text not null,
           author_name text not null default '',
           committed_at text not null,
           changed_files_json text not null,
           primary key (project_id, sha)
         );

         create table commit_task_links (
           id text primary key,
           project_id text not null references projects(id) on delete cascade,
           task_id text not null references tasks(id) on delete cascade,
           commit_sha text not null,
           link_mode text not null check(link_mode in ('focus_interval', 'active_task', 'manual')),
           created_at text not null,
           unique(project_id, task_id, commit_sha),
           foreign key (project_id, commit_sha) references commits(project_id, sha) on delete cascade
         );

         insert or ignore into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
         select project_id, sha, branch, message, author_name, committed_at, changed_files_json
         from commits_old;

         insert or ignore into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
         select commit_task_links_old.id,
                commit_task_links_old.project_id,
                commit_task_links_old.task_id,
                commit_task_links_old.commit_sha,
                commit_task_links_old.link_mode,
                commit_task_links_old.created_at
         from commit_task_links_old
         inner join commits on commits.project_id = commit_task_links_old.project_id
                           and commits.sha = commit_task_links_old.commit_sha
         inner join tasks on tasks.id = commit_task_links_old.task_id
                         and tasks.project_id = commit_task_links_old.project_id;

         drop table commit_task_links_old;
         drop table commits_old;

         pragma foreign_keys = on;",
    )
}

fn commits_are_project_scoped(conn: &Connection) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare("pragma table_info(commits)")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
    })?;

    let mut primary_key_columns = Vec::new();
    for row in rows {
        let (name, primary_key_position) = row?;
        if primary_key_position > 0 {
            primary_key_columns.push((primary_key_position, name));
        }
    }

    primary_key_columns.sort_by_key(|(position, _)| *position);
    Ok(primary_key_columns == vec![(1, "project_id".to_string()), (2, "sha".to_string())])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_core_tables() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");

        let mut stmt = conn
            .prepare("select name from sqlite_master where type = 'table' order by name")
            .expect("table query");

        let names: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("table rows")
            .map(Result::unwrap)
            .collect();

        assert!(names.contains(&"projects".to_string()));
        assert!(names.contains(&"stages".to_string()));
        assert!(names.contains(&"tasks".to_string()));
        assert!(names.contains(&"checklist_items".to_string()));
        assert!(names.contains(&"notes".to_string()));
        assert!(names.contains(&"inbox_items".to_string()));
        assert!(names.contains(&"work_entries".to_string()));
        assert!(names.contains(&"commits".to_string()));
        assert!(names.contains(&"commit_task_links".to_string()));
        assert!(names.contains(&"resume_briefs".to_string()));
        assert!(names.contains(&"entitlements".to_string()));
    }

    #[test]
    fn migration_upgrades_old_commit_tables_to_project_scoped_keys() {
        let conn = create_memory_connection().expect("memory database");
        conn.execute_batch(
            "pragma foreign_keys = on;
             create table projects (
               id text primary key,
               name text not null,
               local_path text not null,
               git_enabled integer not null default 0,
               git_remote text,
               active_task_id text,
               created_at text not null,
               updated_at text not null
             );
             create table stages (
               id text primary key,
               project_id text not null references projects(id) on delete cascade,
               title text not null,
               description text not null default '',
               position integer not null,
               status text not null check(status in ('future', 'current', 'completed')),
               created_at text not null,
               updated_at text not null
             );
             create table tasks (
               id text primary key,
               project_id text not null references projects(id) on delete cascade,
               stage_id text not null references stages(id) on delete cascade,
               title text not null,
               description text not null default '',
               status text not null check(status in ('todo', 'active', 'blocked', 'done')),
               priority text check(priority in ('low', 'normal', 'high')),
               due_date text,
               next_step text not null default '',
               position integer not null,
               created_at text not null,
               updated_at text not null
             );
             create table commits (
               sha text primary key,
               project_id text not null references projects(id) on delete cascade,
               branch text not null,
               message text not null,
               author_name text not null default '',
               committed_at text not null,
               changed_files_json text not null
             );
             create table commit_task_links (
               id text primary key,
               project_id text not null references projects(id) on delete cascade,
               task_id text not null references tasks(id) on delete cascade,
               commit_sha text not null references commits(sha) on delete cascade,
               link_mode text not null check(link_mode in ('focus_interval', 'active_task', 'manual')),
               created_at text not null,
               unique(task_id, commit_sha)
             );
             insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('p1', 'Desclop', '/tmp/desclop', 1, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values ('s1', 'p1', 'Foundation', 0, 'current', '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values ('t1', 'p1', 's1', 'Task', 'active', 0, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values ('abc123', 'p1', 'main', 'Initial', 'Clyde', '2026-05-20T10:10:00Z', '[]');
             insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link-1', 'p1', 't1', 'abc123', 'manual', '2026-05-20T10:11:00Z');",
        )
        .expect("old schema");

        run_migrations(&conn).expect("migrate old schema");

        assert!(commits_are_project_scoped(&conn).expect("project scoped commits"));
        let link_mode: String = conn
            .query_row(
                "select link_mode
                 from commit_task_links
                 inner join commits on commits.project_id = commit_task_links.project_id
                                   and commits.sha = commit_task_links.commit_sha
                 where commit_task_links.id = 'link-1'",
                [],
                |row| row.get(0),
            )
            .expect("preserved link");
        assert_eq!(link_mode, "manual");
    }
}

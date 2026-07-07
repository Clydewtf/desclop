use rusqlite::Connection;

#[cfg(test)]
pub fn create_memory_connection() -> rusqlite::Result<Connection> {
    Connection::open_in_memory()
}

pub fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    Connection::open(path)
}

pub fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(include_str!("../migrations/001_init.sql"))?;
    migrate_plans_schema(conn)?;
    migrate_commit_tables_to_project_scoped_keys(conn)
}

fn migrate_plans_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "create table if not exists plans (
           id text primary key,
           project_id text not null references projects(id) on delete cascade,
           title text not null,
           position integer not null,
           created_at text not null,
           updated_at text not null,
           unique(project_id, id)
         );",
    )?;

    if !table_has_column(conn, "stages", "plan_id")? {
        conn.execute("alter table stages add column plan_id text", [])?;
    }

    conn.execute_batch(
        "insert or ignore into plans (id, project_id, title, position, created_at, updated_at)
         select 'legacy-plan-' || projects.id,
                projects.id,
                'Imported plan',
                0,
                projects.created_at,
                projects.updated_at
         from projects
         where exists (
           select 1 from stages where stages.project_id = projects.id
         )
           and not exists (
             select 1 from plans where plans.project_id = projects.id
           );

         update stages
         set plan_id = (
           select plans.id
           from plans
           where plans.project_id = stages.project_id
           order by plans.position asc, plans.id asc
           limit 1
         )
         where plan_id is null;",
    )
}

fn table_has_column(
    conn: &Connection,
    table_name: &str,
    column_name: &str,
) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("pragma table_info({table_name})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;

    for row in rows {
        if row? == column_name {
            return Ok(true);
        }
    }

    Ok(false)
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

         insert or ignore into commits (project_id, sha, branch, message, author_name, committed_at, changed_files_json)
         select commit_task_links_old.project_id,
                commits_old.sha,
                commits_old.branch,
                commits_old.message,
                commits_old.author_name,
                commits_old.committed_at,
                commits_old.changed_files_json
         from commit_task_links_old
         inner join commits_old on commits_old.sha = commit_task_links_old.commit_sha
         inner join tasks on tasks.id = commit_task_links_old.task_id
                         and tasks.project_id = commit_task_links_old.project_id;

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
        assert!(names.contains(&"plans".to_string()));
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

    #[test]
    fn migration_preserves_old_manual_link_when_global_sha_points_to_other_project() {
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
             values ('p1', 'First', '/tmp/first', 1, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z'),
                    ('p2', 'Second', '/tmp/second', 1, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into stages (id, project_id, title, position, status, created_at, updated_at)
             values ('s1', 'p1', 'Foundation', 0, 'current', '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z'),
                    ('s2', 'p2', 'Foundation', 0, 'current', '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
             values ('t1', 'p1', 's1', 'First task', 'active', 0, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z'),
                    ('t2', 'p2', 's2', 'Second task', 'active', 0, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values ('shared-sha', 'p2', 'main', 'Shared commit', 'Clyde', '2026-05-20T10:10:00Z', '[]');
             insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('manual-p1', 'p1', 't1', 'shared-sha', 'manual', '2026-05-20T10:11:00Z'),
                    ('manual-p2', 'p2', 't2', 'shared-sha', 'manual', '2026-05-20T10:11:00Z');",
        )
        .expect("old cross-project sha schema");

        run_migrations(&conn).expect("migrate old cross-project schema");

        let p1_link_count: i64 = conn
            .query_row(
                "select count(*)
                 from commit_task_links
                 inner join commits on commits.project_id = commit_task_links.project_id
                                   and commits.sha = commit_task_links.commit_sha
                 where commit_task_links.id = 'manual-p1'
                   and commit_task_links.link_mode = 'manual'",
                [],
                |row| row.get(0),
            )
            .expect("p1 link count");
        let commit_count: i64 = conn
            .query_row(
                "select count(*) from commits where sha = 'shared-sha'",
                [],
                |row| row.get(0),
            )
            .expect("commit count");

        assert_eq!(p1_link_count, 1);
        assert_eq!(commit_count, 2);
    }
}

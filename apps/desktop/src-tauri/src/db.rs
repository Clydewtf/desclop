use rusqlite::{Connection, Transaction};

pub const CURRENT_SCHEMA_VERSION: i64 = 4;

#[cfg(test)]
pub fn create_memory_connection() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    configure_connection(&conn)?;
    Ok(conn)
}

pub fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    configure_connection(&conn)?;
    Ok(conn)
}

fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
}

pub fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    run_migrations_with_hook(conn, |_| Ok(()))
}

pub fn schema_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.pragma_query_value(None, "user_version", |row| row.get(0))
}

pub fn migrations_are_pending(conn: &Connection) -> rusqlite::Result<bool> {
    Ok(schema_version(conn)? < CURRENT_SCHEMA_VERSION)
}

pub fn database_integrity_is_ok(conn: &Connection) -> rusqlite::Result<bool> {
    let result: String = conn.query_row("pragma quick_check", [], |row| row.get(0))?;
    Ok(result.eq_ignore_ascii_case("ok"))
}

fn run_migrations_with_hook<F>(conn: &Connection, mut hook: F) -> rusqlite::Result<()>
where
    F: FnMut(i64) -> rusqlite::Result<()>,
{
    let version = schema_version(conn)?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Database schema version {version} is newer than this Desclop build"
        )));
    }

    if version < 1 {
        run_sql_migration(
            conn,
            1,
            include_str!("../migrations/001_init.sql"),
            &mut hook,
        )?;
    }

    if schema_version(conn)? < 2 {
        run_legacy_compatibility_migration(conn, 2, &mut hook)?;
    }

    if schema_version(conn)? < 3 {
        run_sql_migration(
            conn,
            3,
            include_str!("../migrations/003_project_activity.sql"),
            &mut hook,
        )?;
    }

    if schema_version(conn)? < 4 {
        run_sql_migration(
            conn,
            4,
            include_str!("../migrations/004_plan_archiving.sql"),
            &mut hook,
        )?;
    }

    Ok(())
}

fn run_sql_migration<F>(
    conn: &Connection,
    version: i64,
    sql: &str,
    hook: &mut F,
) -> rusqlite::Result<()>
where
    F: FnMut(i64) -> rusqlite::Result<()>,
{
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(sql)?;
    hook(version)?;
    mark_schema_version(&tx, version)?;
    tx.commit()
}

fn run_legacy_compatibility_migration<F>(
    conn: &Connection,
    version: i64,
    hook: &mut F,
) -> rusqlite::Result<()>
where
    F: FnMut(i64) -> rusqlite::Result<()>,
{
    let foreign_keys_enabled: i64 =
        conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
    if foreign_keys_enabled != 0 {
        conn.pragma_update(None, "foreign_keys", "OFF")?;
    }

    let result = (|| {
        let tx = conn.unchecked_transaction()?;
        migrate_plans_schema(&tx)?;
        migrate_checklist_descriptions_schema(&tx)?;
        migrate_task_completion_schema(&tx)?;
        migrate_commit_tables_to_project_scoped_keys(&tx)?;
        hook(version)?;
        mark_schema_version(&tx, version)?;
        tx.commit()
    })();

    if foreign_keys_enabled != 0 {
        conn.pragma_update(None, "foreign_keys", "ON")?;
    }

    result
}

fn mark_schema_version(tx: &Transaction<'_>, version: i64) -> rusqlite::Result<()> {
    tx.pragma_update(None, "user_version", version)
}

fn migrate_task_completion_schema(conn: &Connection) -> rusqlite::Result<()> {
    if !table_has_column(conn, "tasks", "completed_at")? {
        conn.execute("alter table tasks add column completed_at text", [])?;
    }

    Ok(())
}

fn migrate_checklist_descriptions_schema(conn: &Connection) -> rusqlite::Result<()> {
    if !table_has_column(conn, "checklist_items", "description")? {
        conn.execute(
            "alter table checklist_items add column description text not null default ''",
            [],
        )?;
    }

    Ok(())
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
        "alter table commit_task_links rename to commit_task_links_old;
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
         drop table commits_old;",
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
fn run_migrations_with_failpoint(conn: &Connection, fail_at_version: i64) -> rusqlite::Result<()> {
    run_migrations_with_hook(conn, |version| {
        if version == fail_at_version {
            Err(rusqlite::Error::InvalidQuery)
        } else {
            Ok(())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_core_tables_and_records_schema_version() {
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
        assert_eq!(
            schema_version(&conn).expect("schema version"),
            CURRENT_SCHEMA_VERSION
        );
        assert!(database_integrity_is_ok(&conn).expect("integrity check"));
    }

    #[test]
    fn failed_migration_rolls_back_and_a_retry_completes() {
        let conn = create_memory_connection().expect("memory database");

        let error = run_migrations_with_failpoint(&conn, 1).expect_err("injected failure");

        assert!(matches!(error, rusqlite::Error::InvalidQuery));
        assert_eq!(schema_version(&conn).expect("schema version"), 0);
        let project_table_count: i64 = conn
            .query_row(
                "select count(*) from sqlite_master where type = 'table' and name = 'projects'",
                [],
                |row| row.get(0),
            )
            .expect("project table count");
        assert_eq!(project_table_count, 0);

        run_migrations(&conn).expect("retry migration");
        assert_eq!(
            schema_version(&conn).expect("schema version"),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn migration_upgrades_v2_databases_with_project_activity_tracking() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("initial migrations");
        conn.execute_batch(
            "drop trigger touch_project_after_plan_insert;
             drop trigger touch_project_after_plan_update;
             drop trigger touch_project_after_plan_delete;
             drop trigger touch_project_after_stage_insert;
             drop trigger touch_project_after_stage_update;
             drop trigger touch_project_after_stage_delete;
             drop trigger touch_project_after_task_insert;
             drop trigger touch_project_after_task_update;
             drop trigger touch_project_after_task_delete;
             drop trigger touch_project_after_checklist_insert;
             drop trigger touch_project_after_checklist_update;
             drop trigger touch_project_after_checklist_delete;
             drop trigger touch_project_after_note_insert;
             drop trigger touch_project_after_note_update;
             drop trigger touch_project_after_note_delete;
             drop trigger touch_project_after_inbox_insert;
             drop trigger touch_project_after_inbox_update;
             drop trigger touch_project_after_inbox_delete;
             drop trigger touch_project_after_work_entry_insert;
             drop trigger touch_project_after_work_entry_update;
             drop trigger touch_project_after_work_entry_delete;
             drop trigger touch_project_after_commit_insert;
             drop trigger touch_project_after_commit_update;
             drop trigger touch_project_after_commit_delete;
             drop trigger touch_project_after_commit_link_insert;
             drop trigger touch_project_after_commit_link_update;
             drop trigger touch_project_after_commit_link_delete;
             alter table plans drop column archived_at;
             pragma user_version = 2;",
        )
        .expect("simulate v2 database");

        assert!(migrations_are_pending(&conn).expect("pending migrations"));
        run_migrations(&conn).expect("upgrade v2 database");
        conn.execute(
            "insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('activity-project', 'Activity', '/tmp/activity', 0, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')",
            [],
        )
        .expect("project");
        conn.execute(
            "insert into plans (id, project_id, title, position, created_at, updated_at)
             values ('activity-plan', 'activity-project', 'Plan', 0, 'now', 'now')",
            [],
        )
        .expect("plan");

        let updated_at: String = conn
            .query_row(
                "select updated_at from projects where id = 'activity-project'",
                [],
                |row| row.get(0),
            )
            .expect("project timestamp");
        assert_ne!(updated_at, "2000-01-01T00:00:00Z");
        assert_eq!(
            schema_version(&conn).expect("schema version"),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn migration_adds_nullable_plan_archive_state() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        conn.execute_batch(
            "insert into projects (id, name, local_path, git_enabled, created_at, updated_at)
             values ('archive-project', 'Archive', '/tmp/archive', 0, 'now', 'now');
             insert into plans (id, project_id, title, position, created_at, updated_at)
             values ('archive-plan', 'archive-project', 'Completed plan', 0, 'now', 'now');",
        )
        .expect("seed plan without explicit archive value");

        let archived_at: Option<String> = conn
            .query_row(
                "select archived_at from plans where id = 'archive-plan'",
                [],
                |row| row.get(0),
            )
            .expect("archive column");
        assert_eq!(archived_at, None);
        assert_eq!(
            schema_version(&conn).expect("schema version"),
            CURRENT_SCHEMA_VERSION
        );
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
             create table checklist_items (
               id text primary key,
               task_id text not null references tasks(id) on delete cascade,
               title text not null,
               completed integer not null default 0,
               position integer not null,
               created_at text not null,
               updated_at text not null
             );
             create table notes (
               id text primary key,
               project_id text not null references projects(id) on delete cascade,
               task_id text references tasks(id) on delete set null,
               body text not null,
               created_at text not null
             );
             create table work_entries (
               id text primary key,
               project_id text not null references projects(id) on delete cascade,
               task_id text references tasks(id) on delete set null,
               source text not null,
               started_at text,
               ended_at text,
               duration_seconds integer,
               done text not null default '',
               remains text not null default '',
               next_step text not null default '',
               created_at text not null
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
             insert into checklist_items (id, task_id, title, completed, position, created_at, updated_at)
             values ('c1', 't1', 'Checklist', 1, 0, '2026-05-20T10:00:00Z', '2026-05-20T10:00:00Z');
             insert into notes (id, project_id, task_id, body, created_at)
             values ('n1', 'p1', 't1', 'Preserve note', '2026-05-20T10:00:00Z');
             insert into work_entries (id, project_id, task_id, source, done, created_at)
             values ('w1', 'p1', 't1', 'manual', 'Preserve work history', '2026-05-20T10:00:00Z');
             insert into commits (sha, project_id, branch, message, author_name, committed_at, changed_files_json)
             values ('abc123', 'p1', 'main', 'Initial', 'Clyde', '2026-05-20T10:10:00Z', '[]');
             insert into commit_task_links (id, project_id, task_id, commit_sha, link_mode, created_at)
             values ('link-1', 'p1', 't1', 'abc123', 'manual', '2026-05-20T10:11:00Z');",
        )
        .expect("old schema");

        run_migrations(&conn).expect("migrate old schema");

        assert!(commits_are_project_scoped(&conn).expect("project scoped commits"));
        assert_eq!(
            schema_version(&conn).expect("schema version"),
            CURRENT_SCHEMA_VERSION
        );
        let preserved: (String, String, String, String) = conn
            .query_row(
                "select plans.title, tasks.title, notes.body, work_entries.done
                 from plans
                 inner join stages on stages.plan_id = plans.id
                 inner join tasks on tasks.stage_id = stages.id
                 inner join notes on notes.task_id = tasks.id
                 inner join work_entries on work_entries.task_id = tasks.id
                 where plans.project_id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("preserved alpha data");
        assert_eq!(
            preserved,
            (
                "Imported plan".to_string(),
                "Task".to_string(),
                "Preserve note".to_string(),
                "Preserve work history".to_string()
            )
        );
        let checklist_description: String = conn
            .query_row(
                "select description from checklist_items where id = 'c1'",
                [],
                |row| row.get(0),
            )
            .expect("checklist description");
        assert!(checklist_description.is_empty());
    }
}

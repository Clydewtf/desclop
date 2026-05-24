use rusqlite::Connection;

pub fn create_memory_connection() -> rusqlite::Result<Connection> {
    Connection::open_in_memory()
}

pub fn open_connection(path: &std::path::Path) -> rusqlite::Result<Connection> {
    Connection::open(path)
}

pub fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(include_str!("../migrations/001_init.sql"))
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
}

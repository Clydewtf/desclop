use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{Entitlement, SetEntitlementInput};

const LOCAL_ENTITLEMENT_ID: &str = "local";

pub struct EntitlementRepository<'a> {
    conn: &'a Connection,
}

impl<'a> EntitlementRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn get_entitlement(&self) -> rusqlite::Result<Option<Entitlement>> {
        self.conn
            .query_row(
                "select id, license_state, email, license_key_hint, offline_grace_ends_at, updated_at
                 from entitlements
                 where id = ?1",
                params![LOCAL_ENTITLEMENT_ID],
                |row| {
                    Ok(Entitlement {
                        id: row.get(0)?,
                        license_state: row.get(1)?,
                        email: row.get(2)?,
                        license_key_hint: row.get(3)?,
                        offline_grace_ends_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    pub fn set_entitlement(&self, input: SetEntitlementInput) -> rusqlite::Result<Entitlement> {
        validate_license_state(&input.license_state)?;

        let entitlement = Entitlement {
            id: LOCAL_ENTITLEMENT_ID.to_string(),
            license_state: input.license_state,
            email: input.email,
            license_key_hint: input.license_key_hint,
            offline_grace_ends_at: input.offline_grace_ends_at,
            updated_at: Utc::now().to_rfc3339(),
        };

        self.conn.execute(
            "insert into entitlements (id, license_state, email, license_key_hint, offline_grace_ends_at, updated_at)
             values (?1, ?2, ?3, ?4, ?5, ?6)
             on conflict(id) do update set
               license_state = excluded.license_state,
               email = excluded.email,
               license_key_hint = excluded.license_key_hint,
               offline_grace_ends_at = excluded.offline_grace_ends_at,
               updated_at = excluded.updated_at",
            params![
                &entitlement.id,
                &entitlement.license_state,
                &entitlement.email,
                &entitlement.license_key_hint,
                &entitlement.offline_grace_ends_at,
                &entitlement.updated_at
            ],
        )?;

        Ok(entitlement)
    }
}

fn validate_license_state(license_state: &str) -> rusqlite::Result<()> {
    match license_state {
        "free_beta" | "founder" | "trial" | "expired" => Ok(()),
        _ => Err(rusqlite::Error::InvalidParameterName(
            "license_state must be free_beta, founder, trial, or expired".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};

    #[test]
    fn set_and_get_entitlement_without_project_scope() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let repository = EntitlementRepository::new(&conn);

        let entitlement = repository
            .set_entitlement(SetEntitlementInput {
                license_state: "founder".to_string(),
                email: Some("clyde@example.com".to_string()),
                license_key_hint: Some("ABCD".to_string()),
                offline_grace_ends_at: None,
            })
            .expect("set entitlement");
        let reloaded = repository
            .get_entitlement()
            .expect("get entitlement")
            .expect("entitlement");

        assert_eq!(entitlement.license_state, "founder");
        assert_eq!(reloaded.email.as_deref(), Some("clyde@example.com"));
        assert_eq!(reloaded.license_key_hint.as_deref(), Some("ABCD"));
    }

    #[test]
    fn entitlement_schema_does_not_store_project_data() {
        let conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");

        let mut stmt = conn
            .prepare("pragma table_info(entitlements)")
            .expect("table info");
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("columns")
            .map(Result::unwrap)
            .collect();

        assert!(!columns.contains(&"project_id".to_string()));
    }
}

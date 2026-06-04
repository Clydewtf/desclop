use tauri::State;

use crate::app_state::AppState;
use crate::domain::{Entitlement, SetEntitlementInput};
use crate::repositories::entitlements::EntitlementRepository;

#[tauri::command]
pub fn get_entitlement(state: State<'_, AppState>) -> Result<Option<Entitlement>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    EntitlementRepository::new(&conn)
        .get_entitlement()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_entitlement(
    input: SetEntitlementInput,
    state: State<'_, AppState>,
) -> Result<Entitlement, String> {
    let input = SetEntitlementInput {
        email: input.email.map(|email| email.trim().to_string()),
        license_key_hint: input.license_key_hint.map(|hint| hint.trim().to_string()),
        ..input
    };

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    EntitlementRepository::new(&conn)
        .set_entitlement(input)
        .map_err(|err| err.to_string())
}

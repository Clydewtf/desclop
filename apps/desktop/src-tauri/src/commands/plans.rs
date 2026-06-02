use tauri::State;

use crate::app_state::AppState;
use crate::repositories::plans::{
    ImportStage, PlanRepository, ReplacePlanError, PLAN_HAS_TASK_HISTORY_ERROR,
};

#[tauri::command]
pub fn import_plan(
    project_id: String,
    stages: Vec<ImportStage>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if stages.is_empty() {
        return Err("Import requires at least one stage".to_string());
    }

    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    PlanRepository::new(&mut conn)
        .replace_plan(&project_id, stages)
        .map_err(map_replace_plan_error)
}

fn map_replace_plan_error(err: ReplacePlanError) -> String {
    match err {
        ReplacePlanError::TaskHistoryExists => PLAN_HAS_TASK_HISTORY_ERROR.to_string(),
        ReplacePlanError::Database(err) => err.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_task_history_error_to_user_facing_import_message() {
        assert_eq!(
            map_replace_plan_error(ReplacePlanError::TaskHistoryExists),
            PLAN_HAS_TASK_HISTORY_ERROR
        );
    }

    #[test]
    fn does_not_label_unrelated_database_errors_as_task_history() {
        let message =
            map_replace_plan_error(ReplacePlanError::Database(rusqlite::Error::InvalidQuery));

        assert_ne!(message, PLAN_HAS_TASK_HISTORY_ERROR);
    }
}

use tauri::State;

use crate::app_state::AppState;
use crate::repositories::plans::{ImportStage, PlanRepository};

fn validate_import_stages(stages: &[ImportStage]) -> Result<(), String> {
    if stages.is_empty() {
        return Err("Import requires at least one stage".to_string());
    }
    if !stages.iter().any(|stage| !stage.tasks.is_empty()) {
        return Err("Import requires at least one task".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn import_plan(
    project_id: String,
    title: Option<String>,
    stages: Vec<ImportStage>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    validate_import_stages(&stages)?;

    let mut conn = state.conn.lock().map_err(|err| err.to_string())?;
    PlanRepository::new(&mut conn)
        .import_plan(&project_id, title.as_deref().unwrap_or(""), stages)
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repositories::plans::ImportTask;

    fn stage_with_tasks(tasks: Vec<ImportTask>) -> ImportStage {
        ImportStage {
            title: "Foundation".to_string(),
            description: String::new(),
            tasks,
            position: 0,
        }
    }

    #[test]
    fn rejects_an_import_without_stages_or_tasks() {
        assert_eq!(
            validate_import_stages(&[]),
            Err("Import requires at least one stage".to_string())
        );
        assert_eq!(
            validate_import_stages(&[stage_with_tasks(vec![])]),
            Err("Import requires at least one task".to_string())
        );
    }

    #[test]
    fn accepts_stages_with_at_least_one_task() {
        let task = ImportTask {
            title: "Create local store".to_string(),
            description: String::new(),
            status: "todo".to_string(),
            checklist: vec![],
            position: 0,
        };

        assert_eq!(
            validate_import_stages(&[stage_with_tasks(vec![task])]),
            Ok(())
        );
    }
}

use tauri::State;

use crate::app_state::AppState;
use crate::domain::{ChecklistItem, Task};
use crate::repositories::plan_structure::{
    ArchivePlanInput, CreateChecklistItemInput, CreateTaskInput, DeleteChecklistItemInput,
    DeleteStageInput, DeleteTaskInput, MigrateLegacyPlanArchivesInput, MoveTaskInput,
    PlanStructureRepository, ReorderChecklistItemInput, ReorderPlanInput, ReorderStageInput,
    ReorderTaskInput, SavePlanEditorInput, UpdateChecklistItemDetailsInput, UpdatePlanInput,
    UpdateStageInput, UpdateTaskInput,
};

#[tauri::command]
pub fn update_plan(input: UpdatePlanInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .update_plan(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reorder_plan(input: ReorderPlanInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .reorder_plan(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn archive_plan(input: ArchivePlanInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .archive_plan(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn restore_plan(input: ArchivePlanInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .restore_plan(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn migrate_legacy_plan_archives(
    input: MigrateLegacyPlanArchivesInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .migrate_legacy_plan_archives(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_stage(input: UpdateStageInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .update_stage(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reorder_stage(input: ReorderStageInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .reorder_stage(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_plan_editor(
    input: SavePlanEditorInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .save_plan_editor(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_task(input: UpdateTaskInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .update_task(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reorder_task(input: ReorderTaskInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .reorder_task(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_checklist_item_details(
    input: UpdateChecklistItemDetailsInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .update_checklist_item(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn reorder_checklist_item(
    input: ReorderChecklistItemInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .reorder_checklist_item(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn create_task(input: CreateTaskInput, state: State<'_, AppState>) -> Result<Task, String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .create_task(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn create_checklist_item(
    input: CreateChecklistItemInput,
    state: State<'_, AppState>,
) -> Result<ChecklistItem, String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .create_checklist_item(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn move_task(input: MoveTaskInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .move_task(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_stage(input: DeleteStageInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .delete_stage(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_task(input: DeleteTaskInput, state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .delete_task(&input)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_checklist_item(
    input: DeleteChecklistItemInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut conn = state.connection()?;
    PlanStructureRepository::new(&mut conn)
        .delete_checklist_item(&input)
        .map_err(|err| err.to_string())
}

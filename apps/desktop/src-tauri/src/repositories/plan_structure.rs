use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use thiserror::Error;
use uuid::Uuid;

use crate::domain::{ChecklistItem, Task};

use super::tasks::recalculate_stage_statuses;

#[derive(Debug, Error)]
pub enum PlanStructureError {
    #[error("Enter a name before saving.")]
    TitleRequired,
    #[error("The requested item no longer exists.")]
    NotFound,
    #[error("The requested position is outside this list.")]
    InvalidPosition,
    #[error("This plan changed while you were editing. Reload it before saving your changes.")]
    PlanChanged,
    #[error("Tasks can only move to a stage in the same plan.")]
    CrossPlanTaskMove,
    #[error("Move or remove this stage's tasks before deleting the stage.")]
    StageHasTasks,
    #[error("This stage is still referenced by a Resume Brief and can't be deleted. Refresh Resume Brief before deleting the stage.")]
    StageHasResumeBrief,
    #[error("This task has work history, notes, Inbox items, or linked commits and can't be deleted. Complete, move, or hide it instead.")]
    TaskHasHistory,
    #[error("This task is still referenced by a Resume Brief and can't be deleted. Complete, move, or hide it instead.")]
    TaskHasResumeBrief,
    #[error("Choose a new active task or clear it before deleting this task.")]
    ActiveTaskDelete,
    #[error("Confirm deleting this task and its checklist items before continuing.")]
    TaskChecklistConfirmationRequired,
    #[error("Confirm deleting this checklist item before continuing.")]
    ChecklistConfirmationRequired,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlanInput {
    pub plan_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPlanInput {
    pub plan_id: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStageInput {
    pub stage_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderStageInput {
    pub stage_id: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlanEditorStageInput {
    pub client_id: String,
    pub stage_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlanEditorTaskInput {
    pub client_id: String,
    pub task_id: Option<String>,
    pub stage_client_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlanEditorChecklistItemInput {
    pub client_id: String,
    pub item_id: Option<String>,
    pub task_client_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePlanEditorInput {
    pub plan_id: String,
    pub title: String,
    pub stages: Vec<SavePlanEditorStageInput>,
    #[serde(default)]
    pub deleted_stage_ids: Vec<String>,
    #[serde(default)]
    pub tasks: Vec<SavePlanEditorTaskInput>,
    #[serde(default)]
    pub deleted_task_ids: Vec<String>,
    #[serde(default)]
    pub confirmed_task_deletion_ids: Vec<String>,
    #[serde(default)]
    pub checklist_items: Vec<SavePlanEditorChecklistItemInput>,
    #[serde(default)]
    pub deleted_checklist_item_ids: Vec<String>,
    #[serde(default)]
    pub confirmed_checklist_item_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub task_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderTaskInput {
    pub task_id: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChecklistItemDetailsInput {
    pub item_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderChecklistItemInput {
    pub item_id: String,
    pub position: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub stage_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub position: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChecklistItemInput {
    pub task_id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub position: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskInput {
    pub task_id: String,
    pub to_stage_id: String,
    pub position: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteStageInput {
    pub stage_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTaskInput {
    pub task_id: String,
    #[serde(default)]
    pub confirmed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChecklistItemInput {
    pub item_id: String,
    #[serde(default)]
    pub confirmed: bool,
}

pub struct PlanStructureRepository<'a> {
    conn: &'a mut Connection,
}

impl<'a> PlanStructureRepository<'a> {
    pub fn new(conn: &'a mut Connection) -> Self {
        Self { conn }
    }

    pub fn update_plan(&mut self, input: &UpdatePlanInput) -> Result<(), PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let project_id = find_plan_project_id(&tx, &input.plan_id)?;

        tx.execute(
            "update plans set title = ?1, updated_at = ?2 where id = ?3",
            params![title, now, input.plan_id],
        )?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_plan(&mut self, input: &ReorderPlanInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let project_id = find_plan_project_id(&tx, &input.plan_id)?;
        let ids = plan_ids(&tx, &project_id)?;
        let changes = position_changes(&ids, &input.plan_id, input.position)?;

        if !changes.is_empty() {
            apply_position_changes(&tx, "plans", &changes, &now)?;
            touch_project(&tx, &project_id, &now)?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn update_stage(&mut self, input: &UpdateStageInput) -> Result<(), PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, _) = find_stage_context(&tx, &input.stage_id)?;

        tx.execute(
            "update stages
             set title = ?1, description = ?2, updated_at = ?3
             where id = ?4",
            params![title, input.description, now, input.stage_id],
        )?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_stage(&mut self, input: &ReorderStageInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, plan_id) = find_stage_context(&tx, &input.stage_id)?;
        let ids = stage_ids(&tx, &project_id, plan_id.as_deref())?;
        let changes = position_changes(&ids, &input.stage_id, input.position)?;

        if !changes.is_empty() {
            apply_position_changes(&tx, "stages", &changes, &now)?;
            touch_project(&tx, &project_id, &now)?;
            recalculate_stage_statuses(&tx, &project_id)?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn save_plan_editor(
        &mut self,
        input: &SavePlanEditorInput,
    ) -> Result<(), PlanStructureError> {
        let plan_title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let project_id = find_plan_project_id(&tx, &input.plan_id)?;
        let existing_stage_ids = stage_ids(&tx, &project_id, Some(&input.plan_id))?;
        let existing_stage_id_set: HashSet<String> = existing_stage_ids.iter().cloned().collect();
        let mut stage_client_ids = HashSet::new();
        let mut retained_stage_ids = HashSet::new();
        let mut deleted_stage_ids = HashSet::new();

        for (position, stage) in input.stages.iter().enumerate() {
            if stage.client_id.trim().is_empty()
                || !stage_client_ids.insert(stage.client_id.clone())
                || stage.position != position as i64
            {
                return Err(PlanStructureError::InvalidPosition);
            }

            if let Some(stage_id) = &stage.stage_id {
                if !existing_stage_id_set.contains(stage_id)
                    || !retained_stage_ids.insert(stage_id.clone())
                {
                    return Err(PlanStructureError::PlanChanged);
                }
            }
            required_title(&stage.title)?;
        }

        for stage_id in &input.deleted_stage_ids {
            if !existing_stage_id_set.contains(stage_id)
                || retained_stage_ids.contains(stage_id)
                || !deleted_stage_ids.insert(stage_id.clone())
            {
                return Err(PlanStructureError::PlanChanged);
            }
        }

        if retained_stage_ids.len() + deleted_stage_ids.len() != existing_stage_id_set.len() {
            return Err(PlanStructureError::PlanChanged);
        }

        for stage_id in &deleted_stage_ids {
            if stage_has_resume_brief(&tx, stage_id)? {
                return Err(PlanStructureError::StageHasResumeBrief);
            }
        }

        let existing_task_ids = plan_task_ids(&tx, &project_id, &input.plan_id)?;
        let existing_task_id_set: HashSet<String> = existing_task_ids.iter().cloned().collect();
        let mut task_client_ids = HashSet::new();
        let mut retained_task_ids = HashSet::new();
        let mut deleted_task_ids = HashSet::new();
        let mut existing_task_ids_by_client = HashMap::new();
        let mut next_task_position_by_stage = HashMap::new();

        for task in &input.tasks {
            if task.client_id.trim().is_empty()
                || !task_client_ids.insert(task.client_id.clone())
                || !stage_client_ids.contains(&task.stage_client_id)
            {
                return Err(PlanStructureError::PlanChanged);
            }

            let next_position = next_task_position_by_stage
                .entry(task.stage_client_id.clone())
                .or_insert(0_i64);
            if task.position != *next_position {
                return Err(PlanStructureError::InvalidPosition);
            }
            *next_position += 1;

            if let Some(task_id) = &task.task_id {
                if !existing_task_id_set.contains(task_id)
                    || !retained_task_ids.insert(task_id.clone())
                {
                    return Err(PlanStructureError::PlanChanged);
                }
                existing_task_ids_by_client.insert(task.client_id.clone(), task_id.clone());
            }
            required_title(&task.title)?;
        }

        for task_id in &input.deleted_task_ids {
            if !existing_task_id_set.contains(task_id)
                || retained_task_ids.contains(task_id)
                || !deleted_task_ids.insert(task_id.clone())
            {
                return Err(PlanStructureError::PlanChanged);
            }
        }

        if retained_task_ids.len() + deleted_task_ids.len() != existing_task_id_set.len() {
            return Err(PlanStructureError::PlanChanged);
        }

        let existing_checklist_parents =
            plan_checklist_item_parents(&tx, &project_id, &input.plan_id)?;
        let existing_checklist_item_ids: HashSet<String> =
            existing_checklist_parents.keys().cloned().collect();
        let mut checklist_client_ids = HashSet::new();
        let mut retained_checklist_item_ids = HashSet::new();
        let mut deleted_checklist_item_ids = HashSet::new();
        let mut next_checklist_position_by_task = HashMap::new();

        for item in &input.checklist_items {
            if item.client_id.trim().is_empty()
                || !checklist_client_ids.insert(item.client_id.clone())
                || !task_client_ids.contains(&item.task_client_id)
            {
                return Err(PlanStructureError::PlanChanged);
            }

            let next_position = next_checklist_position_by_task
                .entry(item.task_client_id.clone())
                .or_insert(0_i64);
            if item.position != *next_position {
                return Err(PlanStructureError::InvalidPosition);
            }
            *next_position += 1;

            if let Some(item_id) = &item.item_id {
                let existing_task_id = existing_checklist_parents
                    .get(item_id)
                    .ok_or(PlanStructureError::PlanChanged)?;
                if !retained_checklist_item_ids.insert(item_id.clone())
                    || existing_task_ids_by_client.get(&item.task_client_id)
                        != Some(existing_task_id)
                {
                    return Err(PlanStructureError::PlanChanged);
                }
            }
            required_title(&item.title)?;
        }

        for item_id in &input.deleted_checklist_item_ids {
            if !existing_checklist_item_ids.contains(item_id)
                || retained_checklist_item_ids.contains(item_id)
                || !deleted_checklist_item_ids.insert(item_id.clone())
            {
                return Err(PlanStructureError::PlanChanged);
            }
        }

        for (item_id, task_id) in &existing_checklist_parents {
            if deleted_task_ids.contains(task_id) {
                if retained_checklist_item_ids.contains(item_id) {
                    return Err(PlanStructureError::PlanChanged);
                }
            } else if !retained_checklist_item_ids.contains(item_id)
                && !deleted_checklist_item_ids.contains(item_id)
            {
                return Err(PlanStructureError::PlanChanged);
            }
        }

        let confirmed_task_deletion_ids: HashSet<String> =
            input.confirmed_task_deletion_ids.iter().cloned().collect();
        if confirmed_task_deletion_ids.len() != input.confirmed_task_deletion_ids.len()
            || !confirmed_task_deletion_ids.is_subset(&deleted_task_ids)
        {
            return Err(PlanStructureError::PlanChanged);
        }

        let confirmed_checklist_item_ids: HashSet<String> =
            input.confirmed_checklist_item_ids.iter().cloned().collect();
        if confirmed_checklist_item_ids.len() != input.confirmed_checklist_item_ids.len()
            || !confirmed_checklist_item_ids.is_subset(&deleted_checklist_item_ids)
            || !confirmed_checklist_item_ids.is_superset(&deleted_checklist_item_ids)
        {
            return Err(PlanStructureError::PlanChanged);
        }

        for task_id in &deleted_task_ids {
            if is_active_task(&tx, &project_id, task_id)? {
                return Err(PlanStructureError::ActiveTaskDelete);
            }
            if task_has_history(&tx, task_id)? {
                return Err(PlanStructureError::TaskHasHistory);
            }
            if task_has_resume_brief(&tx, task_id)? {
                return Err(PlanStructureError::TaskHasResumeBrief);
            }
            if task_has_checklist_items(&tx, task_id)?
                && !confirmed_task_deletion_ids.contains(task_id)
            {
                return Err(PlanStructureError::TaskChecklistConfirmationRequired);
            }
        }

        tx.execute(
            "update plans set title = ?1, updated_at = ?2 where id = ?3",
            params![plan_title, now, input.plan_id],
        )?;

        let mut final_stage_ids_by_client = HashMap::new();
        for stage in &input.stages {
            let title = required_title(&stage.title)?;
            let stage_id = if let Some(stage_id) = &stage.stage_id {
                tx.execute(
                    "update stages
                     set title = ?1, description = ?2, position = ?3, updated_at = ?4
                     where id = ?5",
                    params![title, stage.description, stage.position, now, stage_id],
                )?;
                stage_id.clone()
            } else {
                let stage_id = Uuid::new_v4().to_string();
                tx.execute(
                    "insert into stages (
                        id, project_id, plan_id, title, description, position, status, created_at, updated_at
                     ) values (?1, ?2, ?3, ?4, ?5, ?6, 'future', ?7, ?7)",
                    params![
                        stage_id,
                        project_id,
                        input.plan_id,
                        title,
                        stage.description,
                        stage.position,
                        now
                    ],
                )?;
                stage_id
            };
            final_stage_ids_by_client.insert(stage.client_id.clone(), stage_id);
        }

        for item_id in &deleted_checklist_item_ids {
            tx.execute(
                "delete from checklist_items where id = ?1",
                params![item_id],
            )?;
        }

        for task_id in &deleted_task_ids {
            tx.execute("delete from tasks where id = ?1", params![task_id])?;
        }

        let mut final_task_ids_by_client = HashMap::new();
        for task in &input.tasks {
            let title = required_title(&task.title)?;
            let stage_id = final_stage_ids_by_client
                .get(&task.stage_client_id)
                .ok_or(PlanStructureError::PlanChanged)?;
            let task_id = if let Some(task_id) = &task.task_id {
                tx.execute(
                    "update tasks
                     set stage_id = ?1, title = ?2, description = ?3, position = ?4, updated_at = ?5
                     where id = ?6",
                    params![
                        stage_id,
                        title,
                        task.description,
                        task.position,
                        now,
                        task_id
                    ],
                )?;
                task_id.clone()
            } else {
                let task_id = Uuid::new_v4().to_string();
                tx.execute(
                    "insert into tasks (
                        id, project_id, stage_id, title, description, status, priority, due_date,
                        next_step, position, created_at, updated_at
                     ) values (?1, ?2, ?3, ?4, ?5, 'todo', null, null, '', ?6, ?7, ?8)",
                    params![
                        task_id,
                        project_id,
                        stage_id,
                        title,
                        task.description,
                        task.position,
                        now,
                        now
                    ],
                )?;
                task_id
            };
            final_task_ids_by_client.insert(task.client_id.clone(), task_id);
        }

        for stage_id in &deleted_stage_ids {
            if stage_has_tasks(&tx, stage_id)? {
                return Err(PlanStructureError::StageHasTasks);
            }
            tx.execute("delete from stages where id = ?1", params![stage_id])?;
        }

        for item in &input.checklist_items {
            let title = required_title(&item.title)?;
            let task_id = final_task_ids_by_client
                .get(&item.task_client_id)
                .ok_or(PlanStructureError::PlanChanged)?;
            if let Some(item_id) = &item.item_id {
                tx.execute(
                    "update checklist_items
                     set title = ?1, description = ?2, position = ?3, updated_at = ?4
                     where id = ?5",
                    params![title, item.description, item.position, now, item_id],
                )?;
            } else {
                let item_id = Uuid::new_v4().to_string();
                tx.execute(
                    "insert into checklist_items (
                        id, task_id, title, description, completed, position, created_at, updated_at
                     ) values (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
                    params![
                        item_id,
                        task_id,
                        title,
                        item.description,
                        item.position,
                        now,
                        now
                    ],
                )?;
            }
        }

        touch_project(&tx, &project_id, &now)?;
        recalculate_stage_statuses(&tx, &project_id)?;
        tx.commit()?;
        Ok(())
    }

    pub fn update_task(&mut self, input: &UpdateTaskInput) -> Result<(), PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, _, _) = find_task_context(&tx, &input.task_id)?;

        tx.execute(
            "update tasks
             set title = ?1, description = ?2, updated_at = ?3
             where id = ?4",
            params![title, input.description, now, input.task_id],
        )?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_task(&mut self, input: &ReorderTaskInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, stage_id, _) = find_task_context(&tx, &input.task_id)?;
        let ids = task_ids(&tx, &project_id, &stage_id)?;
        let changes = position_changes(&ids, &input.task_id, input.position)?;

        if !changes.is_empty() {
            apply_position_changes(&tx, "tasks", &changes, &now)?;
            touch_project(&tx, &project_id, &now)?;
            recalculate_stage_statuses(&tx, &project_id)?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn update_checklist_item(
        &mut self,
        input: &UpdateChecklistItemDetailsInput,
    ) -> Result<(), PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, task_id) = find_checklist_context(&tx, &input.item_id)?;

        tx.execute(
            "update checklist_items
             set title = ?1, description = ?2, updated_at = ?3
             where id = ?4",
            params![title, input.description, now, input.item_id],
        )?;
        touch_task(&tx, &task_id, &now)?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_checklist_item(
        &mut self,
        input: &ReorderChecklistItemInput,
    ) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, task_id) = find_checklist_context(&tx, &input.item_id)?;
        let ids = checklist_item_ids(&tx, &task_id)?;
        let changes = position_changes(&ids, &input.item_id, input.position)?;

        if !changes.is_empty() {
            apply_position_changes(&tx, "checklist_items", &changes, &now)?;
            touch_task(&tx, &task_id, &now)?;
            touch_project(&tx, &project_id, &now)?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn create_task(&mut self, input: &CreateTaskInput) -> Result<Task, PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, _) = find_stage_context(&tx, &input.stage_id)?;
        let ids = task_ids(&tx, &project_id, &input.stage_id)?;
        let position = insertion_position(input.position, ids.len())?;
        let changes = insertion_position_changes(&ids, position);

        if !changes.is_empty() {
            apply_position_changes(&tx, "tasks", &changes, &now)?;
        }

        let id = Uuid::new_v4().to_string();
        tx.execute(
            "insert into tasks (
                id, project_id, stage_id, title, description, status, priority, due_date,
                next_step, position, created_at, updated_at
             ) values (?1, ?2, ?3, ?4, ?5, 'todo', null, null, '', ?6, ?7, ?8)",
            params![
                id,
                project_id,
                input.stage_id,
                title,
                input.description,
                position as i64,
                now,
                now
            ],
        )?;
        touch_project(&tx, &project_id, &now)?;
        recalculate_stage_statuses(&tx, &project_id)?;
        tx.commit()?;

        Ok(Task {
            id,
            project_id,
            stage_id: input.stage_id.clone(),
            title,
            description: input.description.clone(),
            status: "todo".to_string(),
            priority: None,
            due_date: None,
            next_step: String::new(),
            position: position as i64,
            updated_at: Some(now),
            completed_at: None,
        })
    }

    pub fn create_checklist_item(
        &mut self,
        input: &CreateChecklistItemInput,
    ) -> Result<ChecklistItem, PlanStructureError> {
        let title = required_title(&input.title)?;
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let project_id = find_task_project_id(&tx, &input.task_id)?;
        let ids = checklist_item_ids(&tx, &input.task_id)?;
        let position = insertion_position(input.position, ids.len())?;
        let changes = insertion_position_changes(&ids, position);

        if !changes.is_empty() {
            apply_position_changes(&tx, "checklist_items", &changes, &now)?;
        }

        let id = Uuid::new_v4().to_string();
        tx.execute(
            "insert into checklist_items (
                id, task_id, title, description, completed, position, created_at, updated_at
             ) values (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
            params![
                id,
                input.task_id,
                title,
                input.description,
                position as i64,
                now,
                now
            ],
        )?;
        touch_task(&tx, &input.task_id, &now)?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;

        Ok(ChecklistItem {
            id,
            task_id: input.task_id.clone(),
            title,
            description: input.description.clone(),
            completed: false,
            position: position as i64,
        })
    }

    pub fn move_task(&mut self, input: &MoveTaskInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, source_stage_id, source_plan_id) = find_task_context(&tx, &input.task_id)?;
        let (target_project_id, target_plan_id) = find_stage_context(&tx, &input.to_stage_id)?;

        if project_id != target_project_id || source_plan_id != target_plan_id {
            return Err(PlanStructureError::CrossPlanTaskMove);
        }

        if source_stage_id == input.to_stage_id {
            let ids = task_ids(&tx, &project_id, &source_stage_id)?;
            let current_position = ids
                .iter()
                .position(|id| id == &input.task_id)
                .ok_or(PlanStructureError::NotFound)?;
            let target_position = input.position.unwrap_or(current_position as i64);
            let changes = position_changes(&ids, &input.task_id, target_position)?;

            if !changes.is_empty() {
                apply_position_changes(&tx, "tasks", &changes, &now)?;
                touch_project(&tx, &project_id, &now)?;
                recalculate_stage_statuses(&tx, &project_id)?;
            }

            tx.commit()?;
            return Ok(());
        }

        let source_ids = task_ids(&tx, &project_id, &source_stage_id)?;
        let target_ids = task_ids(&tx, &project_id, &input.to_stage_id)?;
        let target_position = insertion_position(input.position, target_ids.len())?;
        let source_changes = removal_position_changes(&source_ids, &input.task_id)?;
        let target_changes = insertion_position_changes(&target_ids, target_position);

        if !source_changes.is_empty() {
            apply_position_changes(&tx, "tasks", &source_changes, &now)?;
        }
        if !target_changes.is_empty() {
            apply_position_changes(&tx, "tasks", &target_changes, &now)?;
        }
        tx.execute(
            "update tasks set stage_id = ?1, position = ?2, updated_at = ?3 where id = ?4",
            params![
                input.to_stage_id,
                target_position as i64,
                now,
                input.task_id
            ],
        )?;
        touch_project(&tx, &project_id, &now)?;
        recalculate_stage_statuses(&tx, &project_id)?;
        tx.commit()?;
        Ok(())
    }

    pub fn delete_stage(&mut self, input: &DeleteStageInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, plan_id) = find_stage_context(&tx, &input.stage_id)?;

        if stage_has_tasks(&tx, &input.stage_id)? {
            return Err(PlanStructureError::StageHasTasks);
        }
        if stage_has_resume_brief(&tx, &input.stage_id)? {
            return Err(PlanStructureError::StageHasResumeBrief);
        }

        let ids = stage_ids(&tx, &project_id, plan_id.as_deref())?;
        let changes = removal_position_changes(&ids, &input.stage_id)?;
        tx.execute("delete from stages where id = ?1", params![input.stage_id])?;
        if !changes.is_empty() {
            apply_position_changes(&tx, "stages", &changes, &now)?;
        }
        touch_project(&tx, &project_id, &now)?;
        recalculate_stage_statuses(&tx, &project_id)?;
        tx.commit()?;
        Ok(())
    }

    pub fn delete_task(&mut self, input: &DeleteTaskInput) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, stage_id, _) = find_task_context(&tx, &input.task_id)?;

        if is_active_task(&tx, &project_id, &input.task_id)? {
            return Err(PlanStructureError::ActiveTaskDelete);
        }
        if task_has_history(&tx, &input.task_id)? {
            return Err(PlanStructureError::TaskHasHistory);
        }
        if task_has_resume_brief(&tx, &input.task_id)? {
            return Err(PlanStructureError::TaskHasResumeBrief);
        }
        if task_has_checklist_items(&tx, &input.task_id)? && !input.confirmed {
            return Err(PlanStructureError::TaskChecklistConfirmationRequired);
        }

        let ids = task_ids(&tx, &project_id, &stage_id)?;
        let changes = removal_position_changes(&ids, &input.task_id)?;
        tx.execute("delete from tasks where id = ?1", params![input.task_id])?;
        if !changes.is_empty() {
            apply_position_changes(&tx, "tasks", &changes, &now)?;
        }
        touch_project(&tx, &project_id, &now)?;
        recalculate_stage_statuses(&tx, &project_id)?;
        tx.commit()?;
        Ok(())
    }

    pub fn delete_checklist_item(
        &mut self,
        input: &DeleteChecklistItemInput,
    ) -> Result<(), PlanStructureError> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.transaction()?;
        let (project_id, task_id) = find_checklist_context(&tx, &input.item_id)?;

        if !input.confirmed {
            return Err(PlanStructureError::ChecklistConfirmationRequired);
        }

        let ids = checklist_item_ids(&tx, &task_id)?;
        let changes = removal_position_changes(&ids, &input.item_id)?;
        tx.execute(
            "delete from checklist_items where id = ?1",
            params![input.item_id],
        )?;
        if !changes.is_empty() {
            apply_position_changes(&tx, "checklist_items", &changes, &now)?;
        }
        touch_task(&tx, &task_id, &now)?;
        touch_project(&tx, &project_id, &now)?;
        tx.commit()?;
        Ok(())
    }
}

fn required_title(title: &str) -> Result<String, PlanStructureError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(PlanStructureError::TitleRequired);
    }

    Ok(title.to_string())
}

fn find_plan_project_id(tx: &Transaction<'_>, plan_id: &str) -> Result<String, PlanStructureError> {
    tx.query_row(
        "select project_id from plans where id = ?1",
        params![plan_id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(PlanStructureError::NotFound)
}

fn find_stage_context(
    tx: &Transaction<'_>,
    stage_id: &str,
) -> Result<(String, Option<String>), PlanStructureError> {
    tx.query_row(
        "select project_id, plan_id from stages where id = ?1",
        params![stage_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?
    .ok_or(PlanStructureError::NotFound)
}

fn find_task_context(
    tx: &Transaction<'_>,
    task_id: &str,
) -> Result<(String, String, Option<String>), PlanStructureError> {
    tx.query_row(
        "select tasks.project_id, tasks.stage_id, stages.plan_id
         from tasks
         inner join stages on stages.id = tasks.stage_id and stages.project_id = tasks.project_id
         where tasks.id = ?1",
        params![task_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()?
    .ok_or(PlanStructureError::NotFound)
}

fn find_task_project_id(tx: &Transaction<'_>, task_id: &str) -> Result<String, PlanStructureError> {
    tx.query_row(
        "select project_id from tasks where id = ?1",
        params![task_id],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(PlanStructureError::NotFound)
}

fn find_checklist_context(
    tx: &Transaction<'_>,
    item_id: &str,
) -> Result<(String, String), PlanStructureError> {
    tx.query_row(
        "select tasks.project_id, checklist_items.task_id
         from checklist_items
         inner join tasks on tasks.id = checklist_items.task_id
         where checklist_items.id = ?1",
        params![item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()?
    .ok_or(PlanStructureError::NotFound)
}

fn stage_has_tasks(tx: &Transaction<'_>, stage_id: &str) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(select 1 from tasks where stage_id = ?1)",
        params![stage_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn stage_has_resume_brief(
    tx: &Transaction<'_>,
    stage_id: &str,
) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(select 1 from resume_briefs where stage_id = ?1)",
        params![stage_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn is_active_task(
    tx: &Transaction<'_>,
    project_id: &str,
    task_id: &str,
) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(
           select 1 from projects where id = ?1 and active_task_id = ?2
         )",
        params![project_id, task_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn task_has_history(tx: &Transaction<'_>, task_id: &str) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(
           select 1 from notes where task_id = ?1
           union all
           select 1 from work_entries where task_id = ?1
           union all
           select 1 from inbox_items where task_id = ?1
           union all
           select 1 from commit_task_links where task_id = ?1
           limit 1
         )",
        params![task_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn task_has_resume_brief(tx: &Transaction<'_>, task_id: &str) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(select 1 from resume_briefs where task_id = ?1)",
        params![task_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn task_has_checklist_items(
    tx: &Transaction<'_>,
    task_id: &str,
) -> Result<bool, PlanStructureError> {
    Ok(tx.query_row(
        "select exists(select 1 from checklist_items where task_id = ?1)",
        params![task_id],
        |row| row.get::<_, i64>(0),
    )? != 0)
}

fn plan_ids(tx: &Transaction<'_>, project_id: &str) -> Result<Vec<String>, PlanStructureError> {
    let mut stmt =
        tx.prepare("select id from plans where project_id = ?1 order by position asc, id asc")?;
    let rows = stmt.query_map(params![project_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn stage_ids(
    tx: &Transaction<'_>,
    project_id: &str,
    plan_id: Option<&str>,
) -> Result<Vec<String>, PlanStructureError> {
    let mut stmt = tx.prepare(
        "select id from stages
         where project_id = ?1 and plan_id is ?2
         order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id, plan_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn task_ids(
    tx: &Transaction<'_>,
    project_id: &str,
    stage_id: &str,
) -> Result<Vec<String>, PlanStructureError> {
    let mut stmt = tx.prepare(
        "select id from tasks
         where project_id = ?1 and stage_id = ?2
         order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![project_id, stage_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn plan_task_ids(
    tx: &Transaction<'_>,
    project_id: &str,
    plan_id: &str,
) -> Result<Vec<String>, PlanStructureError> {
    let mut stmt = tx.prepare(
        "select tasks.id
         from tasks
         inner join stages on stages.id = tasks.stage_id and stages.project_id = tasks.project_id
         where tasks.project_id = ?1 and stages.plan_id = ?2
         order by tasks.id asc",
    )?;
    let rows = stmt.query_map(params![project_id, plan_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn plan_checklist_item_parents(
    tx: &Transaction<'_>,
    project_id: &str,
    plan_id: &str,
) -> Result<HashMap<String, String>, PlanStructureError> {
    let mut stmt = tx.prepare(
        "select checklist_items.id, checklist_items.task_id
         from checklist_items
         inner join tasks on tasks.id = checklist_items.task_id
         inner join stages on stages.id = tasks.stage_id and stages.project_id = tasks.project_id
         where tasks.project_id = ?1 and stages.plan_id = ?2
         order by checklist_items.id asc",
    )?;
    let rows = stmt.query_map(params![project_id, plan_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

fn checklist_item_ids(
    tx: &Transaction<'_>,
    task_id: &str,
) -> Result<Vec<String>, PlanStructureError> {
    let mut stmt = tx.prepare(
        "select id from checklist_items where task_id = ?1 order by position asc, id asc",
    )?;
    let rows = stmt.query_map(params![task_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn position_changes(
    ids: &[String],
    id: &str,
    target_position: i64,
) -> Result<Vec<(String, i64)>, PlanStructureError> {
    if target_position < 0 || target_position as usize >= ids.len() {
        return Err(PlanStructureError::InvalidPosition);
    }

    let current_position = ids
        .iter()
        .position(|current_id| current_id == id)
        .ok_or(PlanStructureError::NotFound)?;
    let target_position = target_position as usize;
    if current_position == target_position {
        return Ok(vec![]);
    }

    let mut reordered = ids.to_vec();
    let moved_id = reordered.remove(current_position);
    reordered.insert(target_position, moved_id);
    let first_changed = current_position.min(target_position);
    let last_changed = current_position.max(target_position);

    Ok((first_changed..=last_changed)
        .map(|position| (reordered[position].clone(), position as i64))
        .collect())
}

fn insertion_position(position: Option<i64>, count: usize) -> Result<usize, PlanStructureError> {
    let position = position.unwrap_or(count as i64);
    if position < 0 || position as usize > count {
        return Err(PlanStructureError::InvalidPosition);
    }

    Ok(position as usize)
}

fn insertion_position_changes(ids: &[String], position: usize) -> Vec<(String, i64)> {
    ids.iter()
        .enumerate()
        .skip(position)
        .map(|(current_position, id)| (id.clone(), (current_position + 1) as i64))
        .collect()
}

fn removal_position_changes(
    ids: &[String],
    id: &str,
) -> Result<Vec<(String, i64)>, PlanStructureError> {
    let current_position = ids
        .iter()
        .position(|current_id| current_id == id)
        .ok_or(PlanStructureError::NotFound)?;
    let mut remaining = ids.to_vec();
    remaining.remove(current_position);

    Ok(remaining
        .into_iter()
        .enumerate()
        .skip(current_position)
        .map(|(position, id)| (id, position as i64))
        .collect())
}

fn apply_position_changes(
    tx: &Transaction<'_>,
    table: &str,
    changes: &[(String, i64)],
    now: &str,
) -> Result<(), PlanStructureError> {
    let sql = format!("update {table} set position = ?1, updated_at = ?2 where id = ?3");
    for (id, position) in changes {
        tx.execute(&sql, params![position, now, id])?;
    }
    Ok(())
}

fn touch_project(
    tx: &Transaction<'_>,
    project_id: &str,
    now: &str,
) -> Result<(), PlanStructureError> {
    let changed = tx.execute(
        "update projects set updated_at = ?1 where id = ?2",
        params![now, project_id],
    )?;
    if changed == 0 {
        return Err(PlanStructureError::NotFound);
    }
    Ok(())
}

fn touch_task(tx: &Transaction<'_>, task_id: &str, now: &str) -> Result<(), PlanStructureError> {
    let changed = tx.execute(
        "update tasks set updated_at = ?1 where id = ?2",
        params![now, task_id],
    )?;
    if changed == 0 {
        return Err(PlanStructureError::NotFound);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_memory_connection, run_migrations};
    use crate::repositories::plans::{
        ImportChecklistItem, ImportStage, ImportTask, PlanRepository,
    };
    use crate::repositories::projects::ProjectRepository;
    use crate::repositories::tasks::TaskRepository;

    fn import_task(title: &str, position: i64, checklist: Vec<ImportChecklistItem>) -> ImportTask {
        ImportTask {
            title: title.to_string(),
            description: format!("{title} description"),
            status: "todo".to_string(),
            checklist,
            position,
        }
    }

    fn import_stage(title: &str, position: i64, tasks: Vec<ImportTask>) -> ImportStage {
        ImportStage {
            title: title.to_string(),
            description: format!("{title} description"),
            tasks,
            position,
        }
    }

    fn checklist_item(title: &str, position: i64) -> ImportChecklistItem {
        ImportChecklistItem {
            title: title.to_string(),
            description: format!("{title} description"),
            completed: false,
            position,
        }
    }

    fn seed_project(conn: &mut Connection) -> String {
        let project = ProjectRepository::new(conn)
            .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
            .expect("create project");

        PlanRepository::new(conn)
            .import_plan(
                &project.id,
                "Alpha",
                vec![
                    import_stage(
                        "Discovery",
                        0,
                        vec![
                            import_task(
                                "First task",
                                0,
                                vec![
                                    checklist_item("First check", 0),
                                    checklist_item("Second check", 1),
                                ],
                            ),
                            import_task("Second task", 1, vec![]),
                        ],
                    ),
                    import_stage("Delivery", 1, vec![import_task("Ship it", 0, vec![])]),
                ],
            )
            .expect("import alpha");
        PlanRepository::new(conn)
            .import_plan(
                &project.id,
                "Beta",
                vec![import_stage(
                    "Beta stage",
                    0,
                    vec![import_task("Beta task", 0, vec![])],
                )],
            )
            .expect("import beta");

        project.id
    }

    fn plan_id(conn: &Connection, project_id: &str, title: &str) -> String {
        conn.query_row(
            "select id from plans where project_id = ?1 and title = ?2",
            params![project_id, title],
            |row| row.get(0),
        )
        .expect("plan id")
    }

    fn stage_id(conn: &Connection, project_id: &str, title: &str) -> String {
        conn.query_row(
            "select id from stages where project_id = ?1 and title = ?2",
            params![project_id, title],
            |row| row.get(0),
        )
        .expect("stage id")
    }

    fn task_id(conn: &Connection, project_id: &str, title: &str) -> String {
        conn.query_row(
            "select id from tasks where project_id = ?1 and title = ?2",
            params![project_id, title],
            |row| row.get(0),
        )
        .expect("task id")
    }

    fn checklist_id(conn: &Connection, task_id: &str, title: &str) -> String {
        conn.query_row(
            "select id from checklist_items where task_id = ?1 and title = ?2",
            params![task_id, title],
            |row| row.get(0),
        )
        .expect("checklist id")
    }

    fn insert_empty_stage(
        conn: &Connection,
        project_id: &str,
        plan_id: &str,
        position: i64,
    ) -> String {
        let now = "2026-07-27T00:00:00Z";
        let stage_id = Uuid::new_v4().to_string();
        conn.execute(
            "update stages
             set position = position + 1
             where project_id = ?1 and plan_id = ?2 and position >= ?3",
            params![project_id, plan_id, position],
        )
        .expect("make space for empty stage");
        conn.execute(
            "insert into stages (
                id, project_id, plan_id, title, description, position, status, created_at, updated_at
             ) values (?1, ?2, ?3, 'Empty stage', '', ?4, 'future', ?5, ?5)",
            params![stage_id, project_id, plan_id, position, now],
        )
        .expect("insert empty stage");
        stage_id
    }

    #[test]
    fn updates_and_reorders_every_structure_level_inside_its_container() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let alpha_plan_id = plan_id(&conn, &project_id, "Alpha");
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");
        let first_task_id = task_id(&conn, &project_id, "First task");
        let first_check_id = checklist_id(&conn, &first_task_id, "First check");

        let mut repository = PlanStructureRepository::new(&mut conn);
        repository
            .update_plan(&UpdatePlanInput {
                plan_id: alpha_plan_id.clone(),
                title: "  Alpha revised  ".to_string(),
            })
            .expect("update plan");
        repository
            .update_stage(&UpdateStageInput {
                stage_id: discovery_stage_id.clone(),
                title: "Research".to_string(),
                description: "Clarify the work".to_string(),
            })
            .expect("update stage");
        repository
            .update_task(&UpdateTaskInput {
                task_id: first_task_id.clone(),
                title: "Investigate".to_string(),
                description: "Gather constraints".to_string(),
            })
            .expect("update task");
        repository
            .update_checklist_item(&UpdateChecklistItemDetailsInput {
                item_id: first_check_id.clone(),
                title: "Read brief".to_string(),
                description: "Use the local contract".to_string(),
            })
            .expect("update checklist item");
        repository
            .reorder_plan(&ReorderPlanInput {
                plan_id: alpha_plan_id,
                position: 1,
            })
            .expect("reorder plan");
        repository
            .reorder_stage(&ReorderStageInput {
                stage_id: discovery_stage_id,
                position: 1,
            })
            .expect("reorder stage");
        repository
            .reorder_task(&ReorderTaskInput {
                task_id: first_task_id.clone(),
                position: 1,
            })
            .expect("reorder task");
        repository
            .reorder_checklist_item(&ReorderChecklistItemInput {
                item_id: first_check_id,
                position: 1,
            })
            .expect("reorder checklist item");

        let plans = TaskRepository::new(&conn)
            .list_plans(&project_id)
            .expect("plans");
        assert_eq!(
            plans
                .iter()
                .map(|plan| plan.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Beta", "Alpha revised"]
        );

        let stages = TaskRepository::new(&conn)
            .list_stages(&project_id)
            .expect("stages");
        let research = stages
            .iter()
            .find(|stage| stage.title == "Research")
            .expect("research stage");
        assert_eq!(research.description, "Clarify the work");
        assert_eq!(research.position, 1);
        assert_eq!(research.status, "future");

        let delivery = stages
            .iter()
            .find(|stage| stage.title == "Delivery")
            .expect("delivery stage");
        assert_eq!(delivery.position, 0);
        assert_eq!(delivery.status, "current");

        let tasks = TaskRepository::new(&conn)
            .list_tasks(&project_id)
            .expect("tasks");
        let research_task_titles = tasks
            .iter()
            .filter(|task| task.stage_id == research.id)
            .map(|task| task.title.as_str())
            .collect::<Vec<_>>();
        assert_eq!(research_task_titles, vec!["Second task", "Investigate"]);
        let investigate = tasks
            .iter()
            .find(|task| task.id == first_task_id)
            .expect("investigate task");
        assert_eq!(investigate.description, "Gather constraints");

        let checklist = TaskRepository::new(&conn)
            .list_checklist_items(&project_id)
            .expect("checklist");
        let checklist_titles = checklist
            .iter()
            .filter(|item| item.task_id == first_task_id)
            .map(|item| item.title.as_str())
            .collect::<Vec<_>>();
        assert_eq!(checklist_titles, vec!["Second check", "Read brief"]);
        assert_eq!(
            checklist
                .iter()
                .find(|item| item.title == "Read brief")
                .expect("renamed checklist")
                .description,
            "Use the local contract"
        );
    }

    #[test]
    fn saves_plan_structure_draft_atomically_with_stable_existing_ids() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let alpha_plan_id = plan_id(&conn, &project_id, "Alpha");
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");
        let delivery_stage_id = stage_id(&conn, &project_id, "Delivery");
        let first_task_id = task_id(&conn, &project_id, "First task");
        let second_task_id = task_id(&conn, &project_id, "Second task");
        let ship_task_id = task_id(&conn, &project_id, "Ship it");
        let first_check_id = checklist_id(&conn, &first_task_id, "First check");
        let second_check_id = checklist_id(&conn, &first_task_id, "Second check");

        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('keep-first-task', ?1, ?2, 'Keep this history', '2026-07-27T00:00:00Z')",
            params![project_id, first_task_id],
        )
        .expect("insert task history");

        let result =
            PlanStructureRepository::new(&mut conn).save_plan_editor(&SavePlanEditorInput {
                plan_id: alpha_plan_id.clone(),
                title: "Should stay unchanged".to_string(),
                stages: vec![
                    SavePlanEditorStageInput {
                        client_id: "discovery".to_string(),
                        stage_id: Some(discovery_stage_id.clone()),
                        title: "Discovery".to_string(),
                        description: "Discovery description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorStageInput {
                        client_id: "delivery".to_string(),
                        stage_id: Some(delivery_stage_id.clone()),
                        title: "Delivery".to_string(),
                        description: "Delivery description".to_string(),
                        position: 1,
                    },
                ],
                deleted_stage_ids: vec![],
                tasks: vec![
                    SavePlanEditorTaskInput {
                        client_id: "second".to_string(),
                        task_id: Some(second_task_id.clone()),
                        stage_client_id: "discovery".to_string(),
                        title: "Second task".to_string(),
                        description: "Second task description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "ship".to_string(),
                        task_id: Some(ship_task_id.clone()),
                        stage_client_id: "delivery".to_string(),
                        title: "Ship it".to_string(),
                        description: "Ship it description".to_string(),
                        position: 0,
                    },
                ],
                deleted_task_ids: vec![first_task_id.clone()],
                confirmed_task_deletion_ids: vec![first_task_id.clone()],
                checklist_items: vec![],
                deleted_checklist_item_ids: vec![],
                confirmed_checklist_item_ids: vec![],
            });
        assert!(matches!(result, Err(PlanStructureError::TaskHasHistory)));
        let unchanged_title: String = conn
            .query_row(
                "select title from plans where id = ?1",
                params![alpha_plan_id],
                |row| row.get(0),
            )
            .expect("plan title");
        assert_eq!(unchanged_title, "Alpha");

        let empty_stage_id = insert_empty_stage(&conn, &project_id, &alpha_plan_id, 2);
        PlanStructureRepository::new(&mut conn)
            .save_plan_editor(&SavePlanEditorInput {
                plan_id: alpha_plan_id.clone(),
                title: "Alpha revised".to_string(),
                stages: vec![
                    SavePlanEditorStageInput {
                        client_id: "delivery".to_string(),
                        stage_id: Some(delivery_stage_id.clone()),
                        title: "Delivery revised".to_string(),
                        description: "Ship the change".to_string(),
                        position: 0,
                    },
                    SavePlanEditorStageInput {
                        client_id: "discovery".to_string(),
                        stage_id: Some(discovery_stage_id.clone()),
                        title: "Discovery revised".to_string(),
                        description: "Clarify the work".to_string(),
                        position: 1,
                    },
                    SavePlanEditorStageInput {
                        client_id: "draft-stage".to_string(),
                        stage_id: None,
                        title: "New stage".to_string(),
                        description: String::new(),
                        position: 2,
                    },
                ],
                deleted_stage_ids: vec![empty_stage_id],
                tasks: vec![
                    SavePlanEditorTaskInput {
                        client_id: "ship".to_string(),
                        task_id: Some(ship_task_id.clone()),
                        stage_client_id: "delivery".to_string(),
                        title: "Ship it".to_string(),
                        description: "Ship it description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "first".to_string(),
                        task_id: Some(first_task_id.clone()),
                        stage_client_id: "delivery".to_string(),
                        title: "Investigate release".to_string(),
                        description: "Keep the imported task and its history".to_string(),
                        position: 1,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "second".to_string(),
                        task_id: Some(second_task_id.clone()),
                        stage_client_id: "discovery".to_string(),
                        title: "Second task".to_string(),
                        description: "Second task description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "draft-task".to_string(),
                        task_id: None,
                        stage_client_id: "draft-stage".to_string(),
                        title: "New task".to_string(),
                        description: "Created in Edit plan".to_string(),
                        position: 0,
                    },
                ],
                deleted_task_ids: vec![],
                confirmed_task_deletion_ids: vec![],
                checklist_items: vec![
                    SavePlanEditorChecklistItemInput {
                        client_id: "second-check".to_string(),
                        item_id: Some(second_check_id.clone()),
                        task_client_id: "first".to_string(),
                        title: "Second check revised".to_string(),
                        description: "Moved to the top".to_string(),
                        position: 0,
                    },
                    SavePlanEditorChecklistItemInput {
                        client_id: "first-check".to_string(),
                        item_id: Some(first_check_id.clone()),
                        task_client_id: "first".to_string(),
                        title: "First check".to_string(),
                        description: "First check description".to_string(),
                        position: 1,
                    },
                    SavePlanEditorChecklistItemInput {
                        client_id: "draft-check".to_string(),
                        item_id: None,
                        task_client_id: "first".to_string(),
                        title: "New check".to_string(),
                        description: "Added locally".to_string(),
                        position: 2,
                    },
                    SavePlanEditorChecklistItemInput {
                        client_id: "draft-task-check".to_string(),
                        item_id: None,
                        task_client_id: "draft-task".to_string(),
                        title: "Prepare work".to_string(),
                        description: "First step for the new task".to_string(),
                        position: 0,
                    },
                ],
                deleted_checklist_item_ids: vec![],
                confirmed_checklist_item_ids: vec![],
            })
            .expect("save plan editor");

        let saved_plan_title: String = conn
            .query_row(
                "select title from plans where id = ?1",
                params![alpha_plan_id],
                |row| row.get(0),
            )
            .expect("saved plan title");
        assert_eq!(saved_plan_title, "Alpha revised");
        let saved_stages: Vec<(String, String, i64)> = {
            let mut statement = conn
                .prepare(
                    "select id, title, position from stages where plan_id = ?1 order by position",
                )
                .expect("prepare stages");
            statement
                .query_map(params![alpha_plan_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .expect("query stages")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect stages")
        };
        assert_eq!(saved_stages.len(), 3);
        assert_eq!(
            saved_stages[0],
            (delivery_stage_id.clone(), "Delivery revised".to_string(), 0)
        );
        assert_eq!(
            saved_stages[1],
            (discovery_stage_id, "Discovery revised".to_string(), 1)
        );
        assert_eq!(saved_stages[2].1, "New stage");
        assert_eq!(saved_stages[2].2, 2);

        let saved_tasks = TaskRepository::new(&conn)
            .list_tasks(&project_id)
            .expect("saved tasks");
        let revised_task = saved_tasks
            .iter()
            .find(|task| task.id == first_task_id)
            .expect("revised task");
        assert_eq!(revised_task.title, "Investigate release");
        assert_eq!(revised_task.stage_id, delivery_stage_id);
        assert_eq!(revised_task.position, 1);
        assert_eq!(revised_task.status, "todo");
        assert!(saved_tasks.iter().any(|task| task.title == "New task"));

        let saved_checklist = TaskRepository::new(&conn)
            .list_checklist_items(&project_id)
            .expect("saved checklist");
        assert_eq!(
            saved_checklist
                .iter()
                .filter(|item| item.task_id == first_task_id)
                .map(|item| item.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Second check revised", "First check", "New check"]
        );
        assert_eq!(
            saved_checklist
                .iter()
                .find(|item| item.id == second_check_id)
                .expect("stable checklist item")
                .description,
            "Moved to the top"
        );
        let note_count: i64 = conn
            .query_row(
                "select count(*) from notes where task_id = ?1 and body = 'Keep this history'",
                params![first_task_id],
                |row| row.get(0),
            )
            .expect("retained note count");
        assert_eq!(note_count, 1);
    }

    #[test]
    fn rejects_editor_changes_that_reference_another_projects_task_without_touching_either_plan() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let other_project = ProjectRepository::new(&conn)
            .create_project("Other".to_string(), "/tmp/other".to_string(), false)
            .expect("create other project");
        PlanRepository::new(&mut conn)
            .import_plan(
                &other_project.id,
                "Other plan",
                vec![import_stage(
                    "Other stage",
                    0,
                    vec![import_task("Other task", 0, vec![])],
                )],
            )
            .expect("import other plan");

        let alpha_plan_id = plan_id(&conn, &project_id, "Alpha");
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");
        let delivery_stage_id = stage_id(&conn, &project_id, "Delivery");
        let first_task_id = task_id(&conn, &project_id, "First task");
        let second_task_id = task_id(&conn, &project_id, "Second task");
        let ship_task_id = task_id(&conn, &project_id, "Ship it");
        let other_task_id = task_id(&conn, &other_project.id, "Other task");

        let result =
            PlanStructureRepository::new(&mut conn).save_plan_editor(&SavePlanEditorInput {
                plan_id: alpha_plan_id.clone(),
                title: "Should not save".to_string(),
                stages: vec![
                    SavePlanEditorStageInput {
                        client_id: "discovery".to_string(),
                        stage_id: Some(discovery_stage_id.clone()),
                        title: "Discovery".to_string(),
                        description: "Discovery description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorStageInput {
                        client_id: "delivery".to_string(),
                        stage_id: Some(delivery_stage_id.clone()),
                        title: "Delivery".to_string(),
                        description: "Delivery description".to_string(),
                        position: 1,
                    },
                ],
                deleted_stage_ids: vec![],
                tasks: vec![
                    SavePlanEditorTaskInput {
                        client_id: "first".to_string(),
                        task_id: Some(first_task_id),
                        stage_client_id: "discovery".to_string(),
                        title: "First task".to_string(),
                        description: "First task description".to_string(),
                        position: 0,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "second".to_string(),
                        task_id: Some(second_task_id),
                        stage_client_id: "discovery".to_string(),
                        title: "Second task".to_string(),
                        description: "Second task description".to_string(),
                        position: 1,
                    },
                    SavePlanEditorTaskInput {
                        client_id: "ship".to_string(),
                        task_id: Some(ship_task_id),
                        stage_client_id: "delivery".to_string(),
                        title: "Ship it".to_string(),
                        description: "Ship it description".to_string(),
                        position: 0,
                    },
                ],
                deleted_task_ids: vec![other_task_id.clone()],
                confirmed_task_deletion_ids: vec![other_task_id.clone()],
                checklist_items: vec![],
                deleted_checklist_item_ids: vec![],
                confirmed_checklist_item_ids: vec![],
            });

        assert!(matches!(result, Err(PlanStructureError::PlanChanged)));
        let first_plan_title: String = conn
            .query_row(
                "select title from plans where id = ?1",
                params![alpha_plan_id],
                |row| row.get(0),
            )
            .expect("first plan title");
        let other_task: (String, String, i64) = conn
            .query_row(
                "select project_id, title, position from tasks where id = ?1",
                params![other_task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("other task");

        assert_eq!(first_plan_title, "Alpha");
        assert_eq!(other_task, (other_project.id, "Other task".to_string(), 0));
    }

    #[test]
    fn creates_task_and_checklist_item_at_the_requested_position() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");
        let first_task_id = task_id(&conn, &project_id, "First task");

        let created_task = PlanStructureRepository::new(&mut conn)
            .create_task(&CreateTaskInput {
                stage_id: discovery_stage_id.clone(),
                title: "Inserted task".to_string(),
                description: "Created locally".to_string(),
                position: Some(1),
            })
            .expect("create task");
        let created_checklist = PlanStructureRepository::new(&mut conn)
            .create_checklist_item(&CreateChecklistItemInput {
                task_id: first_task_id.clone(),
                title: "Inserted check".to_string(),
                description: "Also local".to_string(),
                position: Some(1),
            })
            .expect("create checklist");

        assert_eq!(created_task.stage_id, discovery_stage_id);
        assert_eq!(created_task.position, 1);
        assert!(created_task.updated_at.is_some());
        assert_eq!(created_checklist.task_id, first_task_id);
        assert_eq!(created_checklist.position, 1);

        let tasks = TaskRepository::new(&conn)
            .list_tasks(&project_id)
            .expect("tasks");
        assert_eq!(
            tasks
                .iter()
                .filter(|task| task.stage_id == discovery_stage_id)
                .map(|task| task.title.as_str())
                .collect::<Vec<_>>(),
            vec!["First task", "Inserted task", "Second task"]
        );
        let checklist = TaskRepository::new(&conn)
            .list_checklist_items(&project_id)
            .expect("checklist");
        assert_eq!(
            checklist
                .iter()
                .filter(|item| item.task_id == first_task_id)
                .map(|item| item.title.as_str())
                .collect::<Vec<_>>(),
            vec!["First check", "Inserted check", "Second check"]
        );
    }

    #[test]
    fn moves_task_inside_its_plan_without_losing_its_id_or_history() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let task_id = task_id(&conn, &project_id, "First task");
        let delivery_stage_id = stage_id(&conn, &project_id, "Delivery");

        TaskRepository::new(&conn)
            .set_active_task(&project_id, &task_id)
            .expect("set active task");
        conn.execute(
            "insert into notes (id, project_id, task_id, body, created_at)
             values ('note-1', ?1, ?2, 'Keep this note', '2026-07-27T00:00:00Z')",
            params![project_id, task_id],
        )
        .expect("insert note");

        PlanStructureRepository::new(&mut conn)
            .move_task(&MoveTaskInput {
                task_id: task_id.clone(),
                to_stage_id: delivery_stage_id.clone(),
                position: Some(0),
            })
            .expect("move task");

        let moved_task = TaskRepository::new(&conn)
            .list_tasks(&project_id)
            .expect("tasks")
            .into_iter()
            .find(|task| task.id == task_id)
            .expect("moved task");
        assert_eq!(moved_task.stage_id, delivery_stage_id);
        assert_eq!(moved_task.status, "active");
        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("active task");
        assert_eq!(active_task_id.as_deref(), Some(task_id.as_str()));

        let note_count: i64 = conn
            .query_row(
                "select count(*) from notes where task_id = ?1 and body = 'Keep this note'",
                params![task_id],
                |row| row.get(0),
            )
            .expect("note count");
        assert_eq!(note_count, 1);
        let checklist_count: i64 = conn
            .query_row(
                "select count(*) from checklist_items where task_id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .expect("checklist count");
        assert_eq!(checklist_count, 2);
    }

    #[test]
    fn rejects_a_task_move_to_another_plan_without_changing_the_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let task_id = task_id(&conn, &project_id, "First task");
        let original_stage_id = stage_id(&conn, &project_id, "Discovery");
        let beta_stage_id = stage_id(&conn, &project_id, "Beta stage");

        let result = PlanStructureRepository::new(&mut conn).move_task(&MoveTaskInput {
            task_id: task_id.clone(),
            to_stage_id: beta_stage_id,
            position: Some(0),
        });

        assert!(matches!(result, Err(PlanStructureError::CrossPlanTaskMove)));
        let stage_id_after: String = conn
            .query_row(
                "select stage_id from tasks where id = ?1",
                params![task_id],
                |row| row.get(0),
            )
            .expect("task stage");
        assert_eq!(stage_id_after, original_stage_id);
    }

    #[test]
    fn deletes_only_empty_stages_and_never_removes_a_resume_brief() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");

        let result = PlanStructureRepository::new(&mut conn).delete_stage(&DeleteStageInput {
            stage_id: discovery_stage_id.clone(),
        });
        assert!(matches!(result, Err(PlanStructureError::StageHasTasks)));
        let stage_count: i64 = conn
            .query_row(
                "select count(*) from stages where id = ?1",
                params![discovery_stage_id],
                |row| row.get(0),
            )
            .expect("stage count");
        assert_eq!(stage_count, 1);

        let alpha_plan_id = plan_id(&conn, &project_id, "Alpha");
        let empty_stage_id = insert_empty_stage(&conn, &project_id, &alpha_plan_id, 1);
        conn.execute(
            "insert into resume_briefs (
                id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at
             ) values ('empty-stage-brief', ?1, null, ?2, '', '', '[]', '2026-07-27T00:00:00Z')",
            params![project_id, empty_stage_id],
        )
        .expect("insert resume brief");

        let result = PlanStructureRepository::new(&mut conn).delete_stage(&DeleteStageInput {
            stage_id: empty_stage_id.clone(),
        });
        assert!(matches!(
            result,
            Err(PlanStructureError::StageHasResumeBrief)
        ));
        let brief_count: i64 = conn
            .query_row(
                "select count(*) from resume_briefs where id = 'empty-stage-brief'",
                [],
                |row| row.get(0),
            )
            .expect("resume brief count");
        assert_eq!(brief_count, 1);

        conn.execute(
            "delete from resume_briefs where id = 'empty-stage-brief'",
            [],
        )
        .expect("remove test resume brief");
        PlanStructureRepository::new(&mut conn)
            .delete_stage(&DeleteStageInput {
                stage_id: empty_stage_id,
            })
            .expect("delete empty stage");

        let delivery_position: i64 = conn
            .query_row(
                "select position from stages where project_id = ?1 and title = 'Delivery'",
                params![project_id],
                |row| row.get(0),
            )
            .expect("delivery position");
        assert_eq!(delivery_position, 1);
    }

    #[test]
    fn deleting_a_task_requires_clearing_active_state_and_confirming_its_checklist() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let first_task_id = task_id(&conn, &project_id, "First task");

        TaskRepository::new(&conn)
            .set_active_task(&project_id, &first_task_id)
            .expect("set active task");
        let result = PlanStructureRepository::new(&mut conn).delete_task(&DeleteTaskInput {
            task_id: first_task_id.clone(),
            confirmed: true,
        });
        assert!(matches!(result, Err(PlanStructureError::ActiveTaskDelete)));

        TaskRepository::new(&conn)
            .update_task_status(&first_task_id, "todo")
            .expect("clear active task");
        let result = PlanStructureRepository::new(&mut conn).delete_task(&DeleteTaskInput {
            task_id: first_task_id.clone(),
            confirmed: false,
        });
        assert!(matches!(
            result,
            Err(PlanStructureError::TaskChecklistConfirmationRequired)
        ));
        let checklist_count: i64 = conn
            .query_row(
                "select count(*) from checklist_items where task_id = ?1",
                params![first_task_id],
                |row| row.get(0),
            )
            .expect("checklist count");
        assert_eq!(checklist_count, 2);

        PlanStructureRepository::new(&mut conn)
            .delete_task(&DeleteTaskInput {
                task_id: first_task_id.clone(),
                confirmed: true,
            })
            .expect("delete task with confirmed checklist removal");

        let deleted_task_count: i64 = conn
            .query_row(
                "select count(*) from tasks where id = ?1",
                params![first_task_id],
                |row| row.get(0),
            )
            .expect("deleted task count");
        let remaining_task: (String, i64) = conn
            .query_row(
                "select title, position from tasks where project_id = ?1 and title = 'Second task'",
                params![project_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("remaining task");
        let active_task_id: Option<String> = conn
            .query_row(
                "select active_task_id from projects where id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("active task");
        assert_eq!(deleted_task_count, 0);
        assert_eq!(remaining_task, ("Second task".to_string(), 0));
        assert_eq!(active_task_id, None);
    }

    #[test]
    fn blocks_task_deletion_for_notes_work_inbox_and_git_history() {
        for history_kind in ["note", "work", "inbox", "commit"] {
            let mut conn = create_memory_connection().expect("memory database");
            run_migrations(&conn).expect("migrations");
            let project_id = seed_project(&mut conn);
            let first_task_id = task_id(&conn, &project_id, "First task");

            match history_kind {
                "note" => {
                    conn.execute(
                        "insert into notes (id, project_id, task_id, body, created_at)
                         values ('history-note', ?1, ?2, 'Keep note', '2026-07-27T00:00:00Z')",
                        params![project_id, first_task_id],
                    )
                    .expect("insert note");
                }
                "work" => {
                    conn.execute(
                        "insert into work_entries (
                            id, project_id, task_id, source, done, remains, next_step, created_at
                         ) values ('history-work', ?1, ?2, 'manual', '', '', '', '2026-07-27T00:00:00Z')",
                        params![project_id, first_task_id],
                    )
                    .expect("insert work entry");
                }
                "inbox" => {
                    conn.execute(
                        "insert into inbox_items (
                            id, project_id, task_id, body, kind, status, created_at, updated_at
                         ) values ('history-inbox', ?1, ?2, 'Follow up', 'question', 'attached', '2026-07-27T00:00:00Z', '2026-07-27T00:00:00Z')",
                        params![project_id, first_task_id],
                    )
                    .expect("insert inbox item");
                }
                "commit" => {
                    conn.execute(
                        "insert into commits (
                            project_id, sha, branch, message, author_name, committed_at, changed_files_json
                         ) values (?1, 'history-commit', 'main', 'Keep commit', 'Clyde', '2026-07-27T00:00:00Z', '[]')",
                        params![project_id],
                    )
                    .expect("insert commit");
                    conn.execute(
                        "insert into commit_task_links (
                            id, project_id, task_id, commit_sha, link_mode, created_at
                         ) values ('history-link', ?1, ?2, 'history-commit', 'manual', '2026-07-27T00:00:00Z')",
                        params![project_id, first_task_id],
                    )
                    .expect("insert commit link");
                }
                _ => unreachable!("known history kind"),
            }

            let result = PlanStructureRepository::new(&mut conn).delete_task(&DeleteTaskInput {
                task_id: first_task_id.clone(),
                confirmed: true,
            });
            assert!(matches!(result, Err(PlanStructureError::TaskHasHistory)));
            let task_count: i64 = conn
                .query_row(
                    "select count(*) from tasks where id = ?1",
                    params![first_task_id],
                    |row| row.get(0),
                )
                .expect("task count");
            assert_eq!(task_count, 1, "{history_kind} history must be retained");
        }
    }

    #[test]
    fn blocks_task_deletion_when_a_resume_brief_references_the_task() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let first_task_id = task_id(&conn, &project_id, "First task");
        let discovery_stage_id = stage_id(&conn, &project_id, "Discovery");
        conn.execute(
            "insert into resume_briefs (
                id, project_id, task_id, stage_id, latest_note, next_step, facts_json, generated_at
             ) values ('task-brief', ?1, ?2, ?3, '', 'Keep task', '[]', '2026-07-27T00:00:00Z')",
            params![project_id, first_task_id, discovery_stage_id],
        )
        .expect("insert resume brief");

        let result = PlanStructureRepository::new(&mut conn).delete_task(&DeleteTaskInput {
            task_id: first_task_id.clone(),
            confirmed: true,
        });

        assert!(matches!(
            result,
            Err(PlanStructureError::TaskHasResumeBrief)
        ));
        let brief_count: i64 = conn
            .query_row(
                "select count(*) from resume_briefs where id = 'task-brief' and task_id = ?1",
                params![first_task_id],
                |row| row.get(0),
            )
            .expect("resume brief count");
        assert_eq!(brief_count, 1);
    }

    #[test]
    fn deleting_a_checklist_item_requires_confirmation_and_keeps_task_status() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let first_task_id = task_id(&conn, &project_id, "First task");
        let first_check_id = checklist_id(&conn, &first_task_id, "First check");
        TaskRepository::new(&conn)
            .update_task_status(&first_task_id, "blocked")
            .expect("block task");

        let result = PlanStructureRepository::new(&mut conn).delete_checklist_item(
            &DeleteChecklistItemInput {
                item_id: first_check_id.clone(),
                confirmed: false,
            },
        );
        assert!(matches!(
            result,
            Err(PlanStructureError::ChecklistConfirmationRequired)
        ));

        PlanStructureRepository::new(&mut conn)
            .delete_checklist_item(&DeleteChecklistItemInput {
                item_id: first_check_id,
                confirmed: true,
            })
            .expect("delete confirmed checklist item");

        let task_status: String = conn
            .query_row(
                "select status from tasks where id = ?1",
                params![first_task_id],
                |row| row.get(0),
            )
            .expect("task status");
        let remaining_checklist: (String, i64) = conn
            .query_row(
                "select title, position from checklist_items where task_id = ?1",
                params![first_task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("remaining checklist");
        assert_eq!(task_status, "blocked");
        assert_eq!(remaining_checklist, ("Second check".to_string(), 0));
    }

    #[test]
    fn rejects_empty_titles_before_starting_a_structural_change() {
        let mut conn = create_memory_connection().expect("memory database");
        run_migrations(&conn).expect("migrations");
        let project_id = seed_project(&mut conn);
        let plan_id = plan_id(&conn, &project_id, "Alpha");

        let result = PlanStructureRepository::new(&mut conn).update_plan(&UpdatePlanInput {
            plan_id,
            title: "   ".to_string(),
        });

        assert_eq!(
            result.expect_err("empty title should fail").to_string(),
            "Enter a name before saving."
        );
    }
}

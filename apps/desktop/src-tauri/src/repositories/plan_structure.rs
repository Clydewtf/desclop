use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Deserialize;
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
    #[error("Tasks can only move to a stage in the same plan.")]
    CrossPlanTaskMove,
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

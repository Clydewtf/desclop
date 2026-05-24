use serde::{Deserialize, Serialize};

pub type Id = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Id,
    pub name: String,
    pub local_path: String,
    pub git_enabled: bool,
    pub git_remote: Option<String>,
    pub active_task_id: Option<Id>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub local_path: String,
    pub git_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stage {
    pub id: Id,
    pub project_id: Id,
    pub title: String,
    pub description: String,
    pub position: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: Id,
    pub project_id: Id,
    pub stage_id: Id,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub next_step: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: Id,
    pub task_id: Id,
    pub title: String,
    pub completed: bool,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: Id,
    pub project_id: Id,
    pub task_id: Option<Id>,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub id: Id,
    pub project_id: Id,
    pub task_id: Option<Id>,
    pub body: String,
    pub kind: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkEntry {
    pub id: Id,
    pub project_id: Id,
    pub task_id: Option<Id>,
    pub source: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub done: String,
    pub remains: String,
    pub next_step: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub project_id: Id,
    pub branch: String,
    pub message: String,
    pub author_name: String,
    pub committed_at: String,
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitTaskLink {
    pub id: Id,
    pub project_id: Id,
    pub task_id: Id,
    pub commit_sha: String,
    pub link_mode: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeBrief {
    pub id: Id,
    pub project_id: Id,
    pub task_id: Option<Id>,
    pub stage_id: Option<Id>,
    pub latest_note: String,
    pub next_step: String,
    pub facts: Vec<String>,
    pub generated_at: String,
}

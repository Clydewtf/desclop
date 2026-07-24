use std::fs;
use std::path::{Path, PathBuf};

use git2::Repository;
use serde::Serialize;
use tauri::State;

use crate::app_state::AppState;
use crate::domain::{CreateProjectInput, Project, ProjectSummary};
use crate::repositories::projects::ProjectRepository;

const LOCAL_FOLDER_REQUIRED: &str = "Local folder path is required.";
const LOCAL_FOLDER_NOT_FOUND: &str = "The selected folder does not exist.";
const LOCAL_PATH_NOT_FOLDER: &str = "The selected path is not a folder.";
const LOCAL_FOLDER_UNREADABLE: &str = "The selected folder cannot be read.";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFolderInspection {
    pub git_repository: bool,
}

fn validate_local_project_folder(local_path: &str) -> Result<PathBuf, String> {
    let trimmed_path = local_path.trim();
    if trimmed_path.is_empty() {
        return Err(LOCAL_FOLDER_REQUIRED.to_string());
    }

    let path = Path::new(trimmed_path);
    let metadata = fs::metadata(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => LOCAL_FOLDER_NOT_FOUND.to_string(),
        std::io::ErrorKind::PermissionDenied => LOCAL_FOLDER_UNREADABLE.to_string(),
        _ => LOCAL_FOLDER_UNREADABLE.to_string(),
    })?;

    if !metadata.is_dir() {
        return Err(LOCAL_PATH_NOT_FOLDER.to_string());
    }

    fs::read_dir(path).map_err(|_| LOCAL_FOLDER_UNREADABLE.to_string())?;

    Ok(path.to_path_buf())
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .list_projects()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn list_project_summaries(state: State<'_, AppState>) -> Result<Vec<ProjectSummary>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .list_project_summaries()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn inspect_project_folder(local_path: String) -> Result<ProjectFolderInspection, String> {
    let path = validate_local_project_folder(&local_path)?;

    Ok(ProjectFolderInspection {
        git_repository: Repository::discover(path).is_ok(),
    })
}

#[tauri::command]
pub fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    if input.name.trim().is_empty() {
        return Err("Project name is required".to_string());
    }
    let local_path = validate_local_project_folder(&input.local_path)?;

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .create_project(
            input.name.trim().to_string(),
            local_path.to_string_lossy().to_string(),
            input.git_enabled,
        )
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .delete_project(&project_id)
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "desclop-project-validation-{name}-{}",
            std::process::id()
        ))
    }

    fn reset_test_path(path: &Path) {
        let _ = fs::remove_dir_all(path);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn validates_a_readable_directory() {
        let path = test_path("readable");
        reset_test_path(&path);
        fs::create_dir_all(&path).expect("create test folder");

        let validated = validate_local_project_folder(path.to_str().expect("path"))
            .expect("folder should be valid");

        assert_eq!(validated, path);
        reset_test_path(&path);
    }

    #[test]
    fn rejects_an_empty_path() {
        assert_eq!(
            validate_local_project_folder("   "),
            Err(LOCAL_FOLDER_REQUIRED.to_string())
        );
    }

    #[test]
    fn rejects_a_missing_folder() {
        let path = test_path("missing");
        reset_test_path(&path);

        assert_eq!(
            validate_local_project_folder(path.to_str().expect("path")),
            Err(LOCAL_FOLDER_NOT_FOUND.to_string())
        );
    }

    #[test]
    fn rejects_a_file_as_a_project_folder() {
        let path = test_path("file");
        reset_test_path(&path);
        fs::write(&path, "not a folder").expect("create test file");

        assert_eq!(
            validate_local_project_folder(path.to_str().expect("path")),
            Err(LOCAL_PATH_NOT_FOLDER.to_string())
        );
        reset_test_path(&path);
    }
}

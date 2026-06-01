use git2::{Commit, Repository, Sort};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitMetadata {
    pub sha: String,
    pub branch: String,
    pub message: String,
    pub author_name: String,
    pub committed_at: String,
    pub changed_files: Vec<String>,
}

pub fn read_recent_commits(path: &str, limit: usize) -> Result<Vec<GitCommitMetadata>, String> {
    let repo = Repository::discover(path).map_err(|err| err.to_string())?;
    let head = repo.head().map_err(|err| err.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let mut revwalk = repo.revwalk().map_err(|err| err.to_string())?;
    revwalk.push_head().map_err(|err| err.to_string())?;
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|err| err.to_string())?;

    let mut commits = Vec::new();
    for oid_result in revwalk.take(limit) {
        let oid = oid_result.map_err(|err| err.to_string())?;
        let commit = repo.find_commit(oid).map_err(|err| err.to_string())?;
        let time = chrono::DateTime::from_timestamp(commit.time().seconds(), 0)
            .ok_or_else(|| "Invalid commit timestamp".to_string())?
            .to_rfc3339();
        let changed_files = changed_files_for_commit(&repo, &commit)?;

        commits.push(GitCommitMetadata {
            sha: oid.to_string(),
            branch: branch.clone(),
            message: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            committed_at: time,
            changed_files,
        });
    }

    Ok(commits)
}

fn changed_files_for_commit(repo: &Repository, commit: &Commit<'_>) -> Result<Vec<String>, String> {
    let new_tree = commit.tree().map_err(|err| err.to_string())?;
    let old_tree = if commit.parent_count() > 0 {
        Some(
            commit
                .parent(0)
                .and_then(|parent| parent.tree())
                .map_err(|err| err.to_string())?,
        )
    } else {
        None
    };
    let diff = repo
        .diff_tree_to_tree(old_tree.as_ref(), Some(&new_tree), None)
        .map_err(|err| err.to_string())?;
    let mut changed_files = diff
        .deltas()
        .filter_map(|delta| {
            delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|path| path.to_string_lossy().to_string())
        })
        .collect::<Vec<_>>();
    changed_files.sort();
    changed_files.dedup();

    Ok(changed_files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn test_repo_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("desclop-{name}-{}", std::process::id()))
    }

    fn reset_test_dir(path: &Path) {
        let _ = fs::remove_dir_all(path);
        fs::create_dir_all(path).expect("create test directory");
    }

    fn commit_file(repo: &Repository, relative_path: &str, contents: &str, message: &str) {
        let workdir = repo.workdir().expect("workdir");
        let file_path = workdir.join(relative_path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).expect("create parent directory");
        }
        fs::write(&file_path, contents).expect("write file");

        let mut index = repo.index().expect("index");
        index
            .add_path(Path::new(relative_path))
            .expect("add file to index");
        index.write().expect("write index");
        let tree_oid = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_oid).expect("find tree");
        let signature = Signature::now("Clyde", "clyde@example.com").expect("signature");
        let parents = match repo.head() {
            Ok(head) => {
                let parent = head.peel_to_commit().expect("parent commit");
                vec![parent]
            }
            Err(_) => Vec::new(),
        };
        let parent_refs = parents.iter().collect::<Vec<_>>();

        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )
        .expect("commit");
    }

    #[test]
    fn read_recent_commits_includes_changed_files_for_root_and_child_commits() {
        let repo_path = test_repo_path("git-adapter-changed-files");
        reset_test_dir(&repo_path);
        let repo = Repository::init(&repo_path).expect("init repo");
        commit_file(&repo, "README.md", "# Desclop\n", "Initial commit");
        commit_file(&repo, "src/main.ts", "console.log('desclop');\n", "Add app");

        let commits = read_recent_commits(repo_path.to_str().expect("repo path"), 25)
            .expect("read recent commits");

        let child = commits
            .iter()
            .find(|commit| commit.message == "Add app")
            .expect("child commit");
        let root = commits
            .iter()
            .find(|commit| commit.message == "Initial commit")
            .expect("root commit");
        assert_eq!(child.changed_files, vec!["src/main.ts".to_string()]);
        assert_eq!(root.changed_files, vec!["README.md".to_string()]);

        fs::remove_dir_all(&repo_path).expect("remove test repo");
    }
}

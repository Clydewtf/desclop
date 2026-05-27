use git2::{Repository, Sort};

#[derive(Debug, serde::Serialize)]
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

        commits.push(GitCommitMetadata {
            sha: oid.to_string(),
            branch: branch.clone(),
            message: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            committed_at: time,
            changed_files: Vec::new(),
        });
    }

    Ok(commits)
}

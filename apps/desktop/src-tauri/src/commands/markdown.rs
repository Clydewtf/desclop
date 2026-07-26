use std::fs;
use std::path::Path;

use serde::Serialize;

pub const MAX_MARKDOWN_FILE_BYTES: usize = 1_048_576;

const FILE_REQUIRED: &str = "Choose a Markdown file.";
const FILE_NOT_FOUND: &str = "The selected Markdown file does not exist.";
const FILE_NOT_REGULAR: &str = "The selected Markdown path is not a regular file.";
const FILE_UNSUPPORTED: &str = "Choose a Markdown file with a .md, .markdown, or .txt extension.";
const FILE_TOO_LARGE: &str = "The Markdown file is too large. The maximum size is 1 MB.";
const FILE_NOT_UTF8: &str = "The Markdown file must use UTF-8 encoding.";
const FILE_EMPTY: &str = "The Markdown file is empty. Add Markdown content and try again.";
const FILE_READ_FAILED: &str = "Could not read the selected Markdown file.";

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct MarkdownFileReadResult {
    pub file_name: String,
    pub text: String,
}

fn is_supported_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "txt")
    )
}

#[tauri::command]
pub fn read_markdown_file(file_path: String) -> Result<MarkdownFileReadResult, String> {
    let trimmed_path = file_path.trim();
    if trimmed_path.is_empty() {
        return Err(FILE_REQUIRED.to_string());
    }

    let path = Path::new(trimmed_path);
    if !is_supported_extension(path) {
        return Err(FILE_UNSUPPORTED.to_string());
    }

    let file_type = fs::symlink_metadata(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => FILE_NOT_FOUND.to_string(),
        _ => FILE_READ_FAILED.to_string(),
    })?;
    if !file_type.file_type().is_file() {
        return Err(FILE_NOT_REGULAR.to_string());
    }

    let mut bytes = fs::read(path).map_err(|_| FILE_READ_FAILED.to_string())?;
    if bytes.len() > MAX_MARKDOWN_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_string());
    }

    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes.drain(..3);
    }

    let text = String::from_utf8(bytes).map_err(|_| FILE_NOT_UTF8.to_string())?;
    if text.trim().is_empty() {
        return Err(FILE_EMPTY.to_string());
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| FILE_READ_FAILED.to_string())?
        .to_string();

    Ok(MarkdownFileReadResult { file_name, text })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "desclop-markdown-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    #[test]
    fn reads_utf8_markdown_and_returns_only_the_file_name() {
        let path = test_path("read").with_extension("md");
        fs::write(&path, "# Plan\n- [ ] Task").expect("write fixture");

        let result = read_markdown_file(path.to_string_lossy().to_string()).expect("read markdown");

        assert_eq!(
            result,
            MarkdownFileReadResult {
                file_name: path.file_name().unwrap().to_string_lossy().to_string(),
                text: "# Plan\n- [ ] Task".to_string()
            }
        );
        fs::remove_file(path).expect("remove fixture");
    }

    #[test]
    fn strips_utf8_bom() {
        let path = test_path("bom").with_extension("markdown");
        fs::write(
            &path,
            [0xEF, 0xBB, 0xBF, b'#', b' ', b'P', b'l', b'a', b'n'],
        )
        .expect("write fixture");

        let result = read_markdown_file(path.to_string_lossy().to_string()).expect("read markdown");

        assert_eq!(result.text, "# Plan");
        fs::remove_file(path).expect("remove fixture");
    }

    #[test]
    fn rejects_invalid_extension_directory_invalid_utf8_empty_and_oversized_files() {
        let unsupported = test_path("unsupported").with_extension("pdf");
        fs::write(&unsupported, "not markdown").expect("write fixture");
        assert_eq!(
            read_markdown_file(unsupported.to_string_lossy().to_string()),
            Err(FILE_UNSUPPORTED.to_string())
        );
        fs::remove_file(unsupported).expect("remove fixture");

        let directory = test_path("directory").with_extension("md");
        fs::create_dir(&directory).expect("create fixture directory");
        assert_eq!(
            read_markdown_file(directory.to_string_lossy().to_string()),
            Err(FILE_NOT_REGULAR.to_string())
        );
        fs::remove_dir(directory).expect("remove fixture directory");

        let invalid_utf8 = test_path("invalid").with_extension("txt");
        fs::write(&invalid_utf8, [0xFF, 0xFE]).expect("write fixture");
        assert_eq!(
            read_markdown_file(invalid_utf8.to_string_lossy().to_string()),
            Err(FILE_NOT_UTF8.to_string())
        );
        fs::remove_file(invalid_utf8).expect("remove fixture");

        let empty = test_path("empty").with_extension("md");
        fs::write(&empty, "\u{FEFF}\n  ").expect("write fixture");
        assert_eq!(
            read_markdown_file(empty.to_string_lossy().to_string()),
            Err(FILE_EMPTY.to_string())
        );
        fs::remove_file(empty).expect("remove fixture");

        let oversized = test_path("large").with_extension("md");
        fs::write(&oversized, vec![b'x'; MAX_MARKDOWN_FILE_BYTES + 1]).expect("write fixture");
        assert_eq!(
            read_markdown_file(oversized.to_string_lossy().to_string()),
            Err(FILE_TOO_LARGE.to_string())
        );
        fs::remove_file(oversized).expect("remove fixture");
    }
}

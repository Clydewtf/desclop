import { type FormEvent, useRef, useState } from "react";
import {
  type CreateProjectInput,
  type ProjectFolderInspection
} from "../../shared/api/client";
import {
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  Surface,
  TextField
} from "../../shared/ui";
import { getProjectFolderError, PROJECT_FOLDER_PICKER_ERROR } from "./projectFolder";

interface ProjectSetupProps {
  onCreate: (input: CreateProjectInput) => void | Promise<void>;
  onChooseFolder?: () => Promise<string | null>;
  onValidateFolder?: (localPath: string) => Promise<ProjectFolderInspection>;
  creating?: boolean;
  error?: string | null;
}

export function ProjectSetup({
  onCreate,
  onChooseFolder,
  onValidateFolder,
  creating = false,
  error
}: ProjectSetupProps) {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [gitEnabled, setGitEnabled] = useState(false);
  const [validatingFolder, setValidatingFolder] = useState(false);
  const [folderInspection, setFolderInspection] = useState<{
    path: string;
    result: ProjectFolderInspection;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState({
    name: "",
    localPath: ""
  });
  const folderValidationRequest = useRef(0);

  function resetFolderValidation() {
    folderValidationRequest.current += 1;
    setFolderInspection(null);
    setValidatingFolder(false);
    setValidationErrors((current) => ({ ...current, localPath: "" }));
  }

  async function validateFolder(path: string) {
    const trimmedPath = path.trim();
    const requestId = ++folderValidationRequest.current;

    setFolderInspection(null);
    if (!trimmedPath) {
      setValidatingFolder(false);
      setValidationErrors((current) => ({
        ...current,
        localPath: "Local folder path is required."
      }));
      return null;
    }

    if (!onValidateFolder) {
      setValidatingFolder(false);
      return null;
    }

    setValidatingFolder(true);
    try {
      const result = await onValidateFolder(trimmedPath);
      if (folderValidationRequest.current !== requestId) {
        return null;
      }

      setFolderInspection({ path: trimmedPath, result });
      setValidationErrors((current) => ({ ...current, localPath: "" }));
      return result;
    } catch (error) {
      if (folderValidationRequest.current !== requestId) {
        return null;
      }

      setFolderInspection(null);
      setValidationErrors((current) => ({
        ...current,
        localPath: getProjectFolderError(error)
      }));
      return null;
    } finally {
      if (folderValidationRequest.current === requestId) {
        setValidatingFolder(false);
      }
    }
  }

  async function chooseProjectFolder() {
    if (!onChooseFolder || creating || validatingFolder) {
      return;
    }

    try {
      const selectedPath = await onChooseFolder();
      if (!selectedPath) {
        return;
      }

      setLocalPath(selectedPath);
      setValidationErrors((current) => ({ ...current, localPath: "" }));
      await validateFolder(selectedPath);
    } catch (error) {
      setValidationErrors((current) => ({
        ...current,
        localPath: getProjectFolderError(error, PROJECT_FOLDER_PICKER_ERROR)
      }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating || validatingFolder) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedLocalPath = localPath.trim();
    const nextValidationErrors = {
      name: trimmedName ? "" : "Project name is required.",
      localPath: trimmedLocalPath ? "" : "Local folder path is required."
    };

    setValidationErrors(nextValidationErrors);
    if (nextValidationErrors.name || nextValidationErrors.localPath) {
      return;
    }

    const cachedInspection =
      folderInspection?.path === trimmedLocalPath ? folderInspection.result : null;
    if (onValidateFolder && !cachedInspection) {
      const result = await validateFolder(trimmedLocalPath);
      if (!result) {
        return;
      }
    }

    await onCreate({
      name: trimmedName,
      localPath: trimmedLocalPath,
      gitEnabled
    });
  }

  return (
    <Surface ariaLabel="Create a local project" className="start-flow">
      <ScreenHeader
        title="Create a local project"
        description="Desclop stores project workflow data locally and works without Git."
      />
      <EmptyState
        title="No project setup"
        body="Create a local project record to connect Desclop to this folder."
      />
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <form className="stack" onSubmit={submit}>
        <TextField
          id="project-name"
          label="Project name"
          value={name}
          autoFocus
          disabled={creating}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={validationErrors.name ? "project-name-error" : undefined}
          aria-invalid={validationErrors.name ? "true" : undefined}
          required
        />
        {validationErrors.name ? (
          <span className="field-error" id="project-name-error">
            {validationErrors.name}
          </span>
        ) : null}
        <div className="path-picker">
          <div className="path-picker__row">
            <TextField
              id="project-path"
              label="Local folder path"
              hint="Choose an existing folder, or enter its path manually."
              value={localPath}
              disabled={creating}
              onChange={(event) => {
                setLocalPath(event.target.value);
                resetFolderValidation();
              }}
              placeholder="/Users/clyde/projects/desclop"
              aria-describedby={validationErrors.localPath ? "project-path-error" : undefined}
              aria-invalid={validationErrors.localPath ? "true" : undefined}
              required
            />
            {onChooseFolder ? (
              <Button
                type="button"
                variant="secondary"
                disabled={creating || validatingFolder}
                onClick={() => void chooseProjectFolder()}
              >
                {validatingFolder ? "Checking folder" : "Choose folder"}
              </Button>
            ) : null}
          </div>
          {localPath.trim() ? (
            <p className="project-setup__selected-path" aria-live="polite">
              Folder path: <code>{localPath.trim()}</code>
            </p>
          ) : null}
        </div>
        {validationErrors.localPath ? (
          <span className="field-error" id="project-path-error">
            {validationErrors.localPath}
          </span>
        ) : null}
        {folderInspection?.path === localPath.trim() ? (
          <InlineAlert tone="info">
            {folderInspection.result.gitRepository
              ? "Git repository detected. Connecting Git is optional."
              : "No Git repository detected. You can continue without Git."}
          </InlineAlert>
        ) : null}
        <label className="inline-field">
          <input
            type="checkbox"
            checked={gitEnabled}
            onChange={(event) => setGitEnabled(event.target.checked)}
            disabled={creating}
          />
          Connect local Git repository
        </label>
        <Button type="submit" disabled={creating || validatingFolder}>
          {creating ? "Creating project" : "Create project"}
        </Button>
      </form>
    </Surface>
  );
}

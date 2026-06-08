import { type FormEvent, useState } from "react";
import { type CreateProjectInput } from "../../shared/api/client";
import {
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  Surface,
  TextField
} from "../../shared/ui";

interface ProjectSetupProps {
  onCreate: (input: CreateProjectInput) => void | Promise<void>;
  creating?: boolean;
  error?: string | null;
}

export function ProjectSetup({ onCreate, creating = false, error }: ProjectSetupProps) {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [gitEnabled, setGitEnabled] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    name: "",
    localPath: ""
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (creating) {
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

    onCreate({
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
        <TextField
          id="project-path"
          label="Local folder path"
          value={localPath}
          disabled={creating}
          onChange={(event) => setLocalPath(event.target.value)}
          placeholder="/Users/clyde/projects/desclop"
          aria-describedby={validationErrors.localPath ? "project-path-error" : undefined}
          aria-invalid={validationErrors.localPath ? "true" : undefined}
          required
        />
        {validationErrors.localPath ? (
          <span className="field-error" id="project-path-error">
            {validationErrors.localPath}
          </span>
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
        <Button type="submit" disabled={creating}>
          {creating ? "Creating project" : "Create project"}
        </Button>
      </form>
    </Surface>
  );
}

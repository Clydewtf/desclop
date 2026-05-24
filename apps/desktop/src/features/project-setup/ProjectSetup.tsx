import { type FormEvent, useState } from "react";
import { type CreateProjectInput } from "../../shared/api/client";

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
    <section className="start-flow" aria-labelledby="start-title">
      <h1 id="start-title">Create a local project</h1>
      <p>Desclop stores project workflow data locally and works without Git.</p>
      {error ? <p role="alert">{error}</p> : null}
      <form className="stack" onSubmit={submit}>
        <label htmlFor="project-name">
          Project name
          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={validationErrors.name ? "project-name-error" : undefined}
            aria-invalid={validationErrors.name ? "true" : undefined}
            required
          />
        </label>
        {validationErrors.name ? (
          <span className="field-error" id="project-name-error">
            {validationErrors.name}
          </span>
        ) : null}
        <label htmlFor="project-path">
          Local folder path
          <input
            id="project-path"
            value={localPath}
            onChange={(event) => setLocalPath(event.target.value)}
            placeholder="/Users/clyde/projects/desclop"
            aria-describedby={validationErrors.localPath ? "project-path-error" : undefined}
            aria-invalid={validationErrors.localPath ? "true" : undefined}
            required
          />
        </label>
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
        <button type="submit" disabled={creating}>
          {creating ? "Creating project" : "Create project"}
        </button>
      </form>
    </section>
  );
}

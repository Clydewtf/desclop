import { type FormEvent, useState } from "react";

interface ProjectSetupProps {
  onCreate: (input: { name: string; localPath: string; gitEnabled: boolean }) => void;
}

export function ProjectSetup({ onCreate }: ProjectSetupProps) {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [gitEnabled, setGitEnabled] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      name: name.trim(),
      localPath: localPath.trim(),
      gitEnabled
    });
  }

  return (
    <section className="start-flow" aria-labelledby="start-title">
      <h1 id="start-title">Create a local project</h1>
      <p>Desclop stores project workflow data locally and works without Git.</p>
      <form className="stack" onSubmit={submit}>
        <label>
          Project name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Local folder path
          <input
            value={localPath}
            onChange={(event) => setLocalPath(event.target.value)}
            placeholder="/Users/clyde/projects/desclop"
            required
          />
        </label>
        <label className="inline-field">
          <input
            type="checkbox"
            checked={gitEnabled}
            onChange={(event) => setGitEnabled(event.target.checked)}
          />
          Connect local Git repository
        </label>
        <button type="submit">Create project</button>
      </form>
    </section>
  );
}

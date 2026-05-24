import { useCallback, useEffect, useState } from "react";
import "../styles/base.css";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { api, type CreateProjectInput } from "../shared/api/client";
import { type Project } from "../shared/domain/types";
import { AppShell } from "./shell/AppShell";

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!hasTauriInternals()) {
      setProjects([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      setProjects(await api.listProjects());
    } catch {
      setLoadError("Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function createProject(input: CreateProjectInput) {
    if (creating) {
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const project = await api.createProject(input);
      setProjects([project]);
    } catch {
      setCreateError("Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <main className="app-root">
        <h1>Desclop</h1>
        <p>Loading Desclop</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <section className="start-flow" aria-labelledby="load-error-title">
          <h1 id="load-error-title">Project loading failed</h1>
          <p role="alert">{loadError}</p>
          <button type="button" onClick={loadProjects}>
            Retry
          </button>
        </section>
      </AppShell>
    );
  }

  if (projects.length === 0) {
    return (
      <AppShell>
        <ProjectSetup
          creating={creating}
          error={createError}
          onCreate={createProject}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1>Continue where you left off</h1>
    </AppShell>
  );
}

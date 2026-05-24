import { useEffect, useState } from "react";
import "../styles/base.css";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { api } from "../shared/api/client";
import { type Project } from "../shared/domain/types";
import { AppShell } from "./shell/AppShell";

function hasTauriInternals() {
  return "__TAURI_INTERNALS__" in window;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasTauriInternals()) {
      setLoading(false);
      return;
    }

    api.listProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="app-root">
        <h1>Desclop</h1>
        <p>Loading Desclop</p>
      </main>
    );
  }

  if (projects.length === 0) {
    return (
      <AppShell>
        <ProjectSetup
          onCreate={(input) => {
            api.createProject(input).then((project) => setProjects([project]));
          }}
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

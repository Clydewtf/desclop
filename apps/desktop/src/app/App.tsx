import { useCallback, useEffect, useState } from "react";
import "../styles/base.css";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { Today } from "../features/today/Today";
import { buildResumeBriefView, type ResumeBriefView } from "../features/today/resumeEngine";
import { api, type CreateProjectInput, type ProjectPlanPayload } from "../shared/api/client";
import { type Project, type ResumeBrief } from "../shared/domain/types";
import { AppShell } from "./shell/AppShell";

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ResumeLoadResult {
  brief: ResumeBrief | null;
  unavailable: boolean;
}

async function loadResumeBrief(projectId: string): Promise<ResumeLoadResult> {
  try {
    return { brief: await api.getResumeBrief(projectId), unavailable: false };
  } catch {
    return { brief: null, unavailable: true };
  }
}

function buildTodayView(resumeBrief: ResumeBrief | null, plan: ProjectPlanPayload): ResumeBriefView {
  const task = plan.tasks.find((candidate) => candidate.id === resumeBrief?.taskId) ?? null;
  const resumeTask =
    task && resumeBrief
      ? { ...task, nextStep: resumeBrief.nextStep || task.nextStep }
      : task;
  const stage =
    plan.stages.find((candidate) => candidate.id === (resumeBrief?.stageId ?? resumeTask?.stageId)) ??
    null;
  const nextTasks = plan.tasks.filter(
    (candidate) => candidate.status !== "done" && candidate.id !== resumeTask?.id
  );

  return buildResumeBriefView({
    task: resumeTask,
    stage,
    latestNote: resumeBrief?.latestNote ?? "",
    precomputedFacts: resumeBrief?.facts ?? [],
    commits: [],
    workEntries: [],
    inboxItems: [],
    nextTasks
  });
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeBrief, setResumeBrief] = useState<ResumeBrief | null>(null);
  const [projectPlan, setProjectPlan] = useState<ProjectPlanPayload>({
    stages: [],
    tasks: [],
    checklistItems: []
  });
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
    setResumeError(null);
    try {
      const loadedProjects = await api.listProjects();
      if (loadedProjects[0]) {
        let resumeResult: ResumeLoadResult;
        let plan: ProjectPlanPayload;
        try {
          [resumeResult, plan] = await Promise.all([
            loadResumeBrief(loadedProjects[0].id),
            api.loadProjectPlan(loadedProjects[0].id)
          ]);
        } catch {
          setLoadError("Could not load project plan.");
          return;
        }
        setProjects(loadedProjects);
        setResumeBrief(resumeResult.brief);
        setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
        setProjectPlan(plan);
      } else {
        setProjects(loadedProjects);
        setResumeBrief(null);
        setResumeError(null);
        setProjectPlan({ stages: [], tasks: [], checklistItems: [] });
      }
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
    setResumeError(null);
    try {
      const project = await api.createProject(input);
      let resumeResult: ResumeLoadResult;
      let plan: ProjectPlanPayload;
      try {
        [resumeResult, plan] = await Promise.all([
          loadResumeBrief(project.id),
          api.loadProjectPlan(project.id)
        ]);
      } catch {
        setLoadError("Could not load project plan.");
        return;
      }
      setProjects([project]);
      setResumeBrief(resumeResult.brief);
      setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
      setProjectPlan(plan);
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
      {resumeError ? <p role="status">{resumeError}</p> : null}
      <Today
        view={buildTodayView(resumeBrief, projectPlan)}
        onContinue={() => undefined}
        canContinue={false}
      />
    </AppShell>
  );
}

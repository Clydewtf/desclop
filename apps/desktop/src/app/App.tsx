import { useCallback, useEffect, useState } from "react";
import "../styles/base.css";
import { FocusMode } from "../features/focus-mode/FocusMode";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { TaskDetail, type StartFocusInput } from "../features/task-detail/TaskDetail";
import { Today } from "../features/today/Today";
import { buildResumeBriefView, type ResumeBriefView } from "../features/today/resumeEngine";
import { WorkReview } from "../features/work-log/WorkReview";
import { api, type CreateProjectInput, type ProjectPlanPayload } from "../shared/api/client";
import { type InboxKind, type Note, type Project, type ResumeBrief, type TaskStatus, type WorkEntry } from "../shared/domain/types";
import { AppShell } from "./shell/AppShell";

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ResumeLoadResult {
  brief: ResumeBrief | null;
  unavailable: boolean;
}

type AppScreen = "today" | "task-detail" | "focus" | "work-review";

interface FocusSession {
  taskId: string;
  mode: StartFocusInput["mode"];
  timeboxMinutes: number | null;
  startedAtMs: number;
  nowMs: number;
  endedAtMs: number | null;
  durationSeconds: number | null;
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
  const [screen, setScreen] = useState<AppScreen>("today");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Note[]>([]);
  const [selectedWorkEntries, setSelectedWorkEntries] = useState<WorkEntry[]>([]);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);

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

  useEffect(() => {
    if (screen !== "focus") {
      return;
    }

    const timerId = window.setInterval(() => {
      setFocusSession((session) => (session ? { ...session, nowMs: Date.now() } : session));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [screen]);

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
      setScreen("today");
      setSelectedTaskId(null);
      setSelectedNotes([]);
      setSelectedWorkEntries([]);
      setFocusSession(null);
    } catch {
      setCreateError("Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  const project = projects[0] ?? null;
  const selectedTask =
    projectPlan.tasks.find((candidate) => candidate.id === selectedTaskId) ?? null;
  const resumableTask =
    projectPlan.tasks.find((candidate) => candidate.id === resumeBrief?.taskId) ??
    projectPlan.tasks.find((candidate) => candidate.id === project?.activeTaskId) ??
    projectPlan.tasks.find((candidate) => candidate.status !== "done") ??
    null;

  async function loadTaskContext(taskId: string) {
    if (!project) {
      return;
    }

    const [notes, workEntries] = await Promise.all([
      api.listNotesForTask(project.id, taskId).catch(() => []),
      api.listWorkEntriesForTask(project.id, taskId).catch(() => [])
    ]);
    setSelectedNotes(notes);
    setSelectedWorkEntries(workEntries);
  }

  async function continueTask() {
    if (!resumableTask) {
      return;
    }

    setSelectedTaskId(resumableTask.id);
    await loadTaskContext(resumableTask.id);
    setScreen("task-detail");
  }

  async function changeTaskStatus(taskId: string, status: TaskStatus) {
    await api.updateTaskStatus(taskId, status);
    setProjectPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, status } : task))
    }));
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    await api.updateChecklistItem(itemId, completed);
    setProjectPlan((plan) => ({
      ...plan,
      checklistItems: plan.checklistItems.map((item) =>
        item.id === itemId ? { ...item, completed } : item
      )
    }));
  }

  async function addNote(taskId: string, body: string) {
    if (!project) {
      return;
    }

    const note = await api.addNote(project.id, taskId, body);
    setSelectedNotes((notes) => [...notes, note]);
  }

  async function saveNextStep(taskId: string, nextStep: string) {
    await api.updateNextStep(taskId, nextStep);
    setProjectPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, nextStep } : task))
    }));
  }

  function startFocus(input: StartFocusInput) {
    const startedAtMs = Date.now();
    setFocusSession({
      taskId: input.taskId,
      mode: input.mode,
      timeboxMinutes: input.timeboxMinutes,
      startedAtMs,
      nowMs: startedAtMs,
      endedAtMs: null,
      durationSeconds: null
    });
    setScreen("focus");
  }

  function finishFocus(input: { elapsedSeconds: number }) {
    if (!focusSession) {
      return;
    }

    setFocusSession({
      ...focusSession,
      endedAtMs: focusSession.startedAtMs + input.elapsedSeconds * 1000,
      durationSeconds: input.elapsedSeconds
    });
    setScreen("work-review");
  }

  async function captureInbox(input: { body: string; kind: InboxKind }) {
    if (!project) {
      return;
    }

    await api.captureInboxItem({
      projectId: project.id,
      body: input.body,
      kind: input.kind
    });
  }

  async function saveFocusReview(input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
  }) {
    if (!project || !focusSession) {
      return;
    }

    const endedAtMs = focusSession.endedAtMs ?? Date.now();
    const workEntry = await api.createWorkEntry({
      projectId: project.id,
      taskId: focusSession.taskId,
      source: "focus",
      startedAt: new Date(focusSession.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationSeconds: input.durationSeconds,
      done: input.done,
      remains: input.remains,
      nextStep: input.nextStep
    });

    setSelectedWorkEntries((entries) => [...entries, workEntry]);
    setScreen("task-detail");
  }

  function renderProjectScreen() {
    if (screen === "task-detail" && selectedTask) {
      return (
        <TaskDetail
          task={selectedTask}
          checklist={projectPlan.checklistItems.filter((item) => item.taskId === selectedTask.id)}
          notes={selectedNotes}
          linkedCommits={[]}
          workEntries={selectedWorkEntries}
          inboxItems={[]}
          onStatusChange={changeTaskStatus}
          onChecklistToggle={toggleChecklistItem}
          onNoteAdd={addNote}
          onNextStepSave={saveNextStep}
          onStartFocus={startFocus}
        />
      );
    }

    if (screen === "focus" && focusSession) {
      const focusTask =
        projectPlan.tasks.find((candidate) => candidate.id === focusSession.taskId) ?? null;
      if (focusTask) {
        return (
          <FocusMode
            task={focusTask}
            checklist={projectPlan.checklistItems.filter((item) => item.taskId === focusTask.id)}
            mode={focusSession.mode}
            startedAtMs={focusSession.startedAtMs}
            nowMs={focusSession.nowMs}
            timeboxMinutes={focusSession.timeboxMinutes}
            onFinish={finishFocus}
            onCaptureInbox={captureInbox}
          />
        );
      }
    }

    if (screen === "work-review" && focusSession) {
      return (
        <WorkReview
          durationSeconds={focusSession.durationSeconds}
          onSave={saveFocusReview}
        />
      );
    }

    return (
      <Today
        view={buildTodayView(resumeBrief, projectPlan)}
        onContinue={() => void continueTask()}
        canContinue={Boolean(resumableTask)}
      />
    );
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
      {renderProjectScreen()}
    </AppShell>
  );
}

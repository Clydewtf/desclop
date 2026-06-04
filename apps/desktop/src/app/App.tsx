import { type FormEvent, useCallback, useEffect, useState } from "react";
import "../styles/base.css";
import { exportPlanMarkdown } from "../features/export-import/markdownExport";
import { FocusMode } from "../features/focus-mode/FocusMode";
import { MarkdownImportPreview } from "../features/markdown-import/MarkdownImportPreview";
import { parseMarkdownPlan, type ParsedMarkdownPlan } from "../features/markdown-import/markdownParser";
import { Planner } from "../features/planner/Planner";
import { buildPlannerFrames } from "../features/planner/plannerEngine";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { TaskDetail, type StartFocusInput } from "../features/task-detail/TaskDetail";
import { Timeline } from "../features/timeline/Timeline";
import { Today } from "../features/today/Today";
import { buildResumeBriefView, type ResumeBriefView } from "../features/today/resumeEngine";
import { WorkReview } from "../features/work-log/WorkReview";
import { api, type CreateProjectInput, type ProjectPlanPayload } from "../shared/api/client";
import { type GitCommit, type InboxItem, type InboxKind, type Note, type Project, type ResumeBrief, type TaskStatus, type WorkEntry } from "../shared/domain/types";
import { AppShell } from "./shell/AppShell";

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ResumeLoadResult {
  brief: ResumeBrief | null;
  unavailable: boolean;
}

interface GitLoadResult {
  commits: GitCommit[];
  unavailable: boolean;
}

type AppScreen =
  | "today"
  | "task-detail"
  | "focus"
  | "work-review"
  | "manual-work-review"
  | "import"
  | "planner"
  | "timeline"
  | "export-import";

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

async function loadGitCommits(project: Project): Promise<GitLoadResult> {
  if (!project.gitEnabled) {
    return { commits: [], unavailable: false };
  }

  try {
    return { commits: await api.syncGitCommits(project.id), unavailable: false };
  } catch {
    return { commits: [], unavailable: true };
  }
}

function buildTodayView(
  resumeBrief: ResumeBrief | null,
  plan: ProjectPlanPayload,
  commits: GitCommit[]
): ResumeBriefView {
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
    precomputedFacts: resumeBrief?.facts.length ? resumeBrief.facts : undefined,
    commits,
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
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
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
  const [selectedLinkedCommits, setSelectedLinkedCommits] = useState<GitCommit[]>([]);
  const [selectedInboxItems, setSelectedInboxItems] = useState<InboxItem[]>([]);
  const [timelineNotes, setTimelineNotes] = useState<Note[]>([]);
  const [timelineWorkEntries, setTimelineWorkEntries] = useState<WorkEntry[]>([]);
  const [timelineInboxItems, setTimelineInboxItems] = useState<InboxItem[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);
  const [manualReviewTaskId, setManualReviewTaskId] = useState<string | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [parsedPlan, setParsedPlan] = useState<ParsedMarkdownPlan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [bundleDestination, setBundleDestination] = useState("");
  const [bundleFolder, setBundleFolder] = useState("");
  const [reselectedLocalPath, setReselectedLocalPath] = useState("");
  const [portableStatus, setPortableStatus] = useState<string | null>(null);
  const [portableError, setPortableError] = useState<string | null>(null);

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
    setGitError(null);
    try {
      const loadedProjects = await api.listProjects();
      if (loadedProjects[0]) {
        const activeProject = loadedProjects[0];
        let resumeResult: ResumeLoadResult;
        let gitResult: GitLoadResult;
        let plan: ProjectPlanPayload;
        try {
          [resumeResult, gitResult, plan] = await Promise.all([
            loadResumeBrief(activeProject.id),
            loadGitCommits(activeProject),
            api.loadProjectPlan(activeProject.id)
          ]);
        } catch {
          setLoadError("Could not load project plan.");
          return;
        }
        setProjects(loadedProjects);
        setResumeBrief(resumeResult.brief);
        setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
        setGitCommits(gitResult.commits);
        setGitError(gitResult.unavailable ? "Git unavailable." : null);
        setProjectPlan(plan);
      } else {
        setProjects(loadedProjects);
        setResumeBrief(null);
        setResumeError(null);
        setGitCommits([]);
        setGitError(null);
        setSelectedLinkedCommits([]);
        setSelectedInboxItems([]);
        setTimelineNotes([]);
        setTimelineWorkEntries([]);
        setTimelineInboxItems([]);
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
    setGitError(null);
    try {
      const project = await api.createProject(input);
      let resumeResult: ResumeLoadResult;
      let gitResult: GitLoadResult;
      let plan: ProjectPlanPayload;
      try {
        [resumeResult, gitResult, plan] = await Promise.all([
          loadResumeBrief(project.id),
          loadGitCommits(project),
          api.loadProjectPlan(project.id)
        ]);
      } catch {
        setLoadError("Could not load project plan.");
        return;
      }
      setProjects([project]);
      setResumeBrief(resumeResult.brief);
      setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
      setGitCommits(gitResult.commits);
      setGitError(gitResult.unavailable ? "Git unavailable." : null);
      setProjectPlan(plan);
      setScreen("today");
      setSelectedTaskId(null);
      setSelectedNotes([]);
      setSelectedWorkEntries([]);
      setSelectedLinkedCommits([]);
      setSelectedInboxItems([]);
      setTimelineNotes([]);
      setTimelineWorkEntries([]);
      setTimelineInboxItems([]);
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
  const markdownExport = project
    ? exportPlanMarkdown({
        projectName: project.name,
        stages: projectPlan.stages,
        tasks: projectPlan.tasks,
        checklistItems: projectPlan.checklistItems
      })
    : "";

  async function loadTaskContext(taskId: string) {
    if (!project) {
      return;
    }

    const [notes, workEntries, linkedCommits, inboxItems] = await Promise.all([
      api.listNotesForTask(project.id, taskId).catch(() => []),
      api.listWorkEntriesForTask(project.id, taskId).catch(() => []),
      project.gitEnabled
        ? api.listLinkedCommitsForTask(project.id, taskId).catch(() => [])
        : Promise.resolve([]),
      Promise.resolve(api.listInboxItemsForTask(project.id, taskId))
        .then((items) => items ?? [])
        .catch(() => [])
    ]);
    setSelectedNotes(notes);
    setSelectedWorkEntries(workEntries);
    setSelectedLinkedCommits(linkedCommits);
    setSelectedInboxItems(inboxItems);
  }

  async function refreshProjectData(projectId: string) {
    const [plan, resumeResult] = await Promise.all([
      api.loadProjectPlan(projectId),
      loadResumeBrief(projectId)
    ]);
    setProjectPlan(plan);
    setResumeBrief(resumeResult.brief);
    setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
  }

  async function loadProjectIntoState(activeProject: Project, loadedProjects: Project[]) {
    const [resumeResult, gitResult, plan] = await Promise.all([
      loadResumeBrief(activeProject.id),
      loadGitCommits(activeProject),
      api.loadProjectPlan(activeProject.id)
    ]);
    setProjects([
      activeProject,
      ...loadedProjects.filter((candidate) => candidate.id !== activeProject.id)
    ]);
    setResumeBrief(resumeResult.brief);
    setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
    setGitCommits(gitResult.commits);
    setGitError(gitResult.unavailable ? "Git unavailable." : null);
    setProjectPlan(plan);
    setSelectedTaskId(null);
    setSelectedNotes([]);
    setSelectedWorkEntries([]);
    setSelectedLinkedCommits([]);
    setSelectedInboxItems([]);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    setFocusSession(null);
  }

  async function openTask(taskId: string) {
    setSelectedTaskId(taskId);
    await loadTaskContext(taskId);
    setScreen("task-detail");
  }

  function showProjectScreen(nextScreen: AppScreen) {
    setTimelineError(null);
    setScreen(nextScreen);
  }

  async function openTimeline() {
    if (!project) {
      return;
    }

    setTimelineError(null);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    try {
      const [notes, workEntries, inboxItems] = await Promise.all([
        api.listNotesForProject(project.id),
        api.listWorkEntriesForProject(project.id),
        api.listInboxItemsForProject(project.id)
      ]);
      setTimelineNotes(notes);
      setTimelineWorkEntries(workEntries);
      setTimelineInboxItems(inboxItems);
      setScreen("timeline");
    } catch {
      setTimelineError("Timeline unavailable.");
    }
  }

  async function continueTask() {
    if (!resumableTask) {
      return;
    }

    await openTask(resumableTask.id);
  }

  async function changeTaskStatus(taskId: string, status: TaskStatus) {
    await api.updateTaskStatus(taskId, status);
    if (project) {
      await refreshProjectData(project.id);
    }
    if (selectedTaskId === taskId) {
      await loadTaskContext(taskId);
    }
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

  async function unlinkCommit(commitSha: string, taskId: string) {
    await api.unlinkCommit(commitSha, taskId);
    await loadTaskContext(taskId);
  }

  async function moveCommit(commitSha: string, fromTaskId: string, toTaskId: string) {
    await api.moveCommitLink(commitSha, fromTaskId, toTaskId);
    await loadTaskContext(fromTaskId);
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

  function startManualWorkReview(taskId: string | null) {
    setManualReviewTaskId(taskId);
    setScreen("manual-work-review");
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
    if (input.nextStep) {
      setProjectPlan((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) =>
          task.id === focusSession.taskId ? { ...task, nextStep: input.nextStep } : task
        )
      }));
    }
    setScreen("task-detail");
  }

  async function saveManualReview(input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
  }) {
    if (!project) {
      return;
    }

    const taskId = manualReviewTaskId;
    await api.createWorkEntry({
      projectId: project.id,
      taskId,
      source: "manual",
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: input.done,
      remains: input.remains,
      nextStep: input.nextStep
    });

    await refreshProjectData(project.id);
    if (taskId) {
      await openTask(taskId);
    } else {
      setScreen("today");
    }
  }

  function previewImport() {
    setImportError(null);
    setParsedPlan(parseMarkdownPlan(markdownDraft));
  }

  async function importMarkdownPlan() {
    if (!project || !parsedPlan || importing) {
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      await api.importPlan(project.id, parsedPlan.stages);
      await refreshProjectData(project.id);
      setMarkdownDraft("");
      setParsedPlan(null);
      setScreen("planner");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Plan already has task history")) {
        setImportError("Could not import plan without losing existing task history.");
      } else {
        setImportError("Could not import plan.");
      }
    } finally {
      setImporting(false);
    }
  }

  async function exportPortableBundle(event: FormEvent) {
    event.preventDefault();
    if (!project) {
      return;
    }

    const destination = bundleDestination.trim();
    if (!destination) {
      setPortableError("Bundle destination folder is required.");
      setPortableStatus(null);
      return;
    }

    setPortableError(null);
    setPortableStatus(null);
    try {
      const exportedPath = await api.exportProjectBundle(project.id, destination);
      setPortableStatus(`Exported portable bundle to ${exportedPath}`);
    } catch {
      setPortableError("Could not export portable bundle.");
    }
  }

  async function importPortableBundle(event: FormEvent) {
    event.preventDefault();
    const source = bundleFolder.trim();
    const localPath = reselectedLocalPath.trim();
    if (!source || !localPath) {
      setPortableError("Bundle folder and reselected local folder path are required.");
      setPortableStatus(null);
      return;
    }

    setPortableError(null);
    setPortableStatus(null);
    try {
      const importedProjectId = await api.importProjectBundle(source, localPath);
      const loadedProjects = await api.listProjects();
      const importedProject = loadedProjects.find(
        (candidate) => candidate.id === importedProjectId
      );
      if (!importedProject) {
        throw new Error("Imported project was not returned by list_projects.");
      }
      await loadProjectIntoState(importedProject, loadedProjects);
      setPortableStatus("Imported portable project.");
    } catch {
      setPortableError("Could not import portable bundle.");
    }
  }

  function renderProjectScreen() {
    if (screen === "import") {
      return (
        <section className="stack" aria-labelledby="import-title">
          <h1 id="import-title">Import plan</h1>
          {importError ? <p role="alert">{importError}</p> : null}
          <label htmlFor="markdown-plan">Markdown plan</label>
          <textarea
            id="markdown-plan"
            value={markdownDraft}
            disabled={importing}
            onChange={(event) => setMarkdownDraft(event.target.value)}
          />
          <button type="button" disabled={importing} onClick={previewImport}>
            Preview import
          </button>
          {parsedPlan ? (
            <MarkdownImportPreview
              parsed={parsedPlan}
              onImport={() => void importMarkdownPlan()}
              importing={importing}
            />
          ) : null}
        </section>
      );
    }

    if (screen === "planner") {
      return (
        <Planner
          frames={buildPlannerFrames(
            projectPlan.stages,
            projectPlan.tasks,
            projectPlan.checklistItems
          )}
          onContinueTask={(taskId) => void openTask(taskId)}
        />
      );
    }

    if (screen === "timeline") {
      return (
        <Timeline
          workEntries={timelineWorkEntries}
          commits={gitCommits}
          notes={timelineNotes}
          inboxItems={timelineInboxItems}
          completedTasks={projectPlan.tasks.filter((task) => task.status === "done")}
        />
      );
    }

    if (screen === "export-import") {
      return (
        <section className="stack" aria-labelledby="export-import-title">
          <h1 id="export-import-title">Export / Import</h1>
          {portableError ? <p role="alert">{portableError}</p> : null}
          {portableStatus ? <p role="status">{portableStatus}</p> : null}
          <label htmlFor="markdown-export">Markdown export</label>
          <textarea id="markdown-export" readOnly value={markdownExport} />
          <form className="stack" onSubmit={exportPortableBundle}>
            <label htmlFor="bundle-destination">Bundle destination folder</label>
            <input
              id="bundle-destination"
              value={bundleDestination}
              onChange={(event) => setBundleDestination(event.target.value)}
            />
            <button type="submit">Export portable bundle</button>
          </form>
          <form className="stack" onSubmit={importPortableBundle}>
            <label htmlFor="bundle-folder">Bundle folder</label>
            <input
              id="bundle-folder"
              value={bundleFolder}
              onChange={(event) => setBundleFolder(event.target.value)}
            />
            <label htmlFor="reselected-local-path">Reselected local folder path</label>
            <input
              id="reselected-local-path"
              value={reselectedLocalPath}
              onChange={(event) => setReselectedLocalPath(event.target.value)}
            />
            <button type="submit">Import portable bundle</button>
          </form>
        </section>
      );
    }

    if (screen === "task-detail" && selectedTask) {
      return (
        <TaskDetail
          task={selectedTask}
          checklist={projectPlan.checklistItems.filter((item) => item.taskId === selectedTask.id)}
          notes={selectedNotes}
          linkedCommits={selectedLinkedCommits}
          availableTasks={projectPlan.tasks.filter((candidate) => candidate.id !== selectedTask.id)}
          workEntries={selectedWorkEntries}
          inboxItems={selectedInboxItems}
          onStatusChange={changeTaskStatus}
          onChecklistToggle={toggleChecklistItem}
          onNoteAdd={addNote}
          onNextStepSave={saveNextStep}
          onStartFocus={startFocus}
          onCommitUnlink={unlinkCommit}
          onCommitMove={moveCommit}
          onCaptureInbox={captureInbox}
          onStartManualWorkReview={() => startManualWorkReview(selectedTask.id)}
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
            onNoteAdd={(body) => addNote(focusTask.id, body)}
            onChecklistToggle={toggleChecklistItem}
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

    if (screen === "manual-work-review") {
      return (
        <WorkReview
          durationSeconds={null}
          onSave={saveManualReview}
        />
      );
    }

    return (
      <Today
        view={buildTodayView(resumeBrief, projectPlan, gitCommits)}
        onContinue={() => void continueTask()}
        onCaptureInbox={captureInbox}
        onStartManualWorkReview={() => startManualWorkReview(resumableTask?.id ?? null)}
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
      {resumeError || gitError ? (
        <div role="status">
          {resumeError ? <p>{resumeError}</p> : null}
          {gitError ? <p>{gitError}</p> : null}
        </div>
      ) : null}
      {timelineError ? <p role="alert">{timelineError}</p> : null}
      {project ? (
        <nav aria-label="Project navigation">
          <button type="button" onClick={() => showProjectScreen("today")}>
            Today
          </button>
          <button type="button" onClick={() => showProjectScreen("planner")}>
            Open planner
          </button>
          <button type="button" onClick={() => void openTimeline()}>
            Timeline
          </button>
          <button type="button" onClick={() => showProjectScreen("export-import")}>
            Export / Import
          </button>
          <button
            type="button"
            aria-label={screen === "import" ? "Import plan navigation" : undefined}
            onClick={() => showProjectScreen("import")}
          >
            Import plan
          </button>
        </nav>
      ) : null}
      {renderProjectScreen()}
    </AppShell>
  );
}

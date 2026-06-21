import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/base.css";
import { exportPlanMarkdown } from "../features/export-import/markdownExport";
import { FocusMode } from "../features/focus-mode/FocusMode";
import { MarkdownImportPreview } from "../features/markdown-import/MarkdownImportPreview";
import { parseMarkdownPlan, type ParsedMarkdownPlan } from "../features/markdown-import/markdownParser";
import { Planner } from "../features/planner/Planner";
import { buildPlannerFrames } from "../features/planner/plannerEngine";
import { QuickCaptureOverlay } from "../features/quick-capture/QuickCaptureOverlay";
import {
  ProjectPicker,
  type ProjectDeleteError
} from "../features/project-setup/ProjectPicker";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { TaskDetail, type StartFocusInput } from "../features/task-detail/TaskDetail";
import { Timeline } from "../features/timeline/Timeline";
import { Today } from "../features/today/Today";
import { buildResumeBriefView, type ResumeBriefView } from "../features/today/resumeEngine";
import { Utilities } from "../features/utilities/Utilities";
import { WorkReview } from "../features/work-log/WorkReview";
import { api, type CreateProjectInput, type ProjectPlanPayload } from "../shared/api/client";
import { chooseFolder } from "../shared/api/folderDialog";
import {
  type GitCommit,
  type InboxItem,
  type InboxKind,
  type Note,
  type Project,
  type ProjectSummary,
  type ResumeBrief,
  type TaskStatus,
  type WorkEntry
} from "../shared/domain/types";
import {
  Button,
  InlineAlert,
  ScreenHeader,
  Surface,
  TextArea
} from "../shared/ui";
import { AppShell, type AppDestination } from "./shell/AppShell";

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
  | "plan"
  | "timeline"
  | "utilities"
  | "setup";

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

async function loadListOrEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return (await Promise.resolve(load())) ?? [];
  } catch {
    return [];
  }
}

function indexProjectSummaries(summaries: ProjectSummary[]) {
  return Object.fromEntries(summaries.map((summary) => [summary.projectId, summary]));
}

async function loadProjectSummariesOrEmpty() {
  try {
    return indexProjectSummaries(await api.listProjectSummaries());
  } catch {
    return {};
  }
}

function buildTodayView(
  resumeBrief: ResumeBrief | null,
  plan: ProjectPlanPayload,
  currentTask: ProjectPlanPayload["tasks"][number] | null,
  commits: GitCommit[]
): ResumeBriefView {
  const task = currentTask;
  const resumeMatchesTask = task !== null && resumeBrief !== null && resumeBrief.taskId === task.id;
  const resumeTask =
    task && resumeMatchesTask
      ? { ...task, nextStep: task.nextStep || resumeBrief.nextStep }
      : task;
  const stage =
    plan.stages.find((candidate) => candidate.id === resumeTask?.stageId) ?? null;
  const stagePositions = new Map(plan.stages.map((candidate) => [candidate.id, candidate.position]));
  const nextTasks = plan.tasks
    .filter((candidate) => candidate.status !== "done" && candidate.id !== resumeTask?.id)
    .sort((left, right) => {
      const stagePositionDifference =
        (stagePositions.get(left.stageId) ?? Number.MAX_SAFE_INTEGER) -
        (stagePositions.get(right.stageId) ?? Number.MAX_SAFE_INTEGER);
      const taskPositionDifference = left.position - right.position;

      return (
        stagePositionDifference ||
        taskPositionDifference ||
        left.stageId.localeCompare(right.stageId) ||
        left.id.localeCompare(right.id)
      );
    });

  return buildResumeBriefView({
    task: resumeTask,
    stage,
    latestNote: resumeMatchesTask ? resumeBrief.latestNote : "",
    precomputedFacts:
      resumeMatchesTask && resumeBrief.facts.length ? resumeBrief.facts : undefined,
    commits,
    workEntries: [],
    inboxItems: [],
    nextTasks,
    hasPlan: plan.tasks.length > 0 || plan.stages.length > 0
  });
}

function activeDestinationForScreen(screen: AppScreen): AppDestination {
  if (screen === "plan" || screen === "timeline" || screen === "import" || screen === "utilities") {
    return screen;
  }

  if (screen === "setup") {
    return "setup";
  }

  return "today";
}

function defaultQuickCaptureTaskId({
  screen,
  selectedTaskId,
  focusTaskId,
  todayTaskId,
  activeTaskId
}: {
  screen: AppScreen;
  selectedTaskId: string | null;
  focusTaskId: string | null;
  todayTaskId: string | null;
  activeTaskId: string | null;
}) {
  if (screen === "task-detail" && selectedTaskId) {
    return selectedTaskId;
  }
  if (screen === "focus" && focusTaskId) {
    return focusTaskId;
  }
  if (screen === "today" && todayTaskId) {
    return todayTaskId;
  }
  if (screen === "plan" && activeTaskId) {
    return activeTaskId;
  }
  return null;
}

export function App() {
  const projectContextRevision = useRef(0);
  const captureOperationRevision = useRef(0);
  const deleteProjectInFlight = useRef(false);
  const projectsRef = useRef<Project[]>([]);
  const screenRef = useRef<AppScreen>("today");
  const selectedTaskIdRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<Record<string, ProjectSummary>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<ProjectDeleteError | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<"picker" | "create">("picker");
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
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickCaptureDefaultTaskId, setQuickCaptureDefaultTaskId] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);

  function invalidateProjectContext() {
    projectContextRevision.current += 1;
    return projectContextRevision.current;
  }

  function isCurrentProjectContext(revision: number) {
    return projectContextRevision.current === revision;
  }

  function invalidateCaptureOperations() {
    captureOperationRevision.current += 1;
    return captureOperationRevision.current;
  }

  function resetProjectContext() {
    invalidateCaptureOperations();
    setSelectedProjectId(null);
    setLoadError(null);
    setPickerError(null);
    setResumeError(null);
    setGitError(null);
    setGitCommits([]);
    setResumeBrief(null);
    setProjectPlan({ stages: [], tasks: [], checklistItems: [] });
    setCreateError(null);
    setScreen("today");
    setSelectedTaskId(null);
    setSelectedNotes([]);
    setSelectedWorkEntries([]);
    setSelectedLinkedCommits([]);
    setSelectedInboxItems([]);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    setTimelineError(null);
    setFocusSession(null);
    setManualReviewTaskId(null);
    setMarkdownDraft("");
    setParsedPlan(null);
    setImportError(null);
    setImporting(false);
    setBundleDestination("");
    setBundleFolder("");
    setReselectedLocalPath("");
    setPortableStatus(null);
    setPortableError(null);
    setQuickCaptureOpen(false);
    setQuickCaptureDefaultTaskId(null);
    setCaptureStatus(null);
  }

  function beginProjectLoad() {
    const revision = invalidateProjectContext();
    resetProjectContext();
    return revision;
  }

  const loadProjects = useCallback(async () => {
    if (!hasTauriInternals()) {
      setProjects([]);
      setProjectSummaries({});
      setLoadError(null);
      setPickerError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setPickerError(null);
    setResumeError(null);
    setGitError(null);
    try {
      const [loadedProjects, loadedProjectSummaries] = await Promise.all([
        api.listProjects(),
        loadProjectSummariesOrEmpty()
      ]);
      setProjects(loadedProjects);
      setProjectSummaries(loadedProjectSummaries);
      if (loadedProjects[0]) {
        try {
          await loadProjectIntoState(loadedProjects[0], loadedProjects);
        } catch {
          setLoadError("Could not load project plan.");
          return;
        }
      } else {
        resetProjectContext();
        setSetupMode("create");
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
    projectsRef.current = projects;
  }, [projects]);

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
      setProjectSummaries(await loadProjectSummariesOrEmpty());
      try {
        const nextProjects = [
          ...projectsRef.current.filter((candidate) => candidate.id !== project.id),
          project
        ];
        await loadProjectIntoState(project, nextProjects);
      } catch {
        setLoadError("Could not load project plan.");
        return;
      }
    } catch {
      setCreateError("Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  const project =
    projects.find((candidate) => candidate.id === selectedProjectId) ?? null;
  const selectedTask =
    projectPlan.tasks.find((candidate) => candidate.id === selectedTaskId) ?? null;
  const todayTask =
    projectPlan.tasks.find(
      (candidate) => candidate.id === resumeBrief?.taskId && candidate.status !== "done"
    ) ??
    projectPlan.tasks.find(
      (candidate) => candidate.id === project?.activeTaskId && candidate.status !== "done"
    ) ??
    null;
  screenRef.current = screen;
  selectedTaskIdRef.current = selectedTaskId;
  const projectId = project?.id ?? null;
  const projectActiveTaskId = project?.activeTaskId ?? null;
  const selectedCaptureTaskId = selectedTask?.id ?? null;
  const focusCaptureTaskId = focusSession?.taskId ?? null;
  const todayCaptureTaskId = todayTask?.id ?? null;
  const markdownExport = project
    ? exportPlanMarkdown({
        projectName: project.name,
        stages: projectPlan.stages,
        tasks: projectPlan.tasks,
        checklistItems: projectPlan.checklistItems
      })
    : "";

  const openQuickCapture = useCallback(() => {
    if (!projectId) {
      return;
    }

    invalidateCaptureOperations();
    setQuickCaptureDefaultTaskId(
      defaultQuickCaptureTaskId({
        screen,
        selectedTaskId: selectedCaptureTaskId,
        focusTaskId: focusCaptureTaskId,
        todayTaskId: todayCaptureTaskId,
        activeTaskId: projectActiveTaskId
      })
    );
    setCaptureStatus(null);
    setQuickCaptureOpen(true);
  }, [
    focusCaptureTaskId,
    projectActiveTaskId,
    projectId,
    screen,
    selectedCaptureTaskId,
    todayCaptureTaskId
  ]);

  const closeQuickCapture = useCallback(() => {
    invalidateCaptureOperations();
    setQuickCaptureOpen(false);
  }, []);

  useEffect(() => {
    function handleQuickCaptureShortcut(event: KeyboardEvent) {
      if (
        event.shiftKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        openQuickCapture();
      }
    }

    window.addEventListener("keydown", handleQuickCaptureShortcut);
    return () => window.removeEventListener("keydown", handleQuickCaptureShortcut);
  }, [openQuickCapture]);

  async function loadTaskContext(taskId: string, revision: number) {
    if (!project) {
      return false;
    }

    const [notes, workEntries, linkedCommits, taskInboxItems, projectInboxItems] = await Promise.all([
      loadListOrEmpty(() => api.listNotesForTask(project.id, taskId)),
      loadListOrEmpty(() => api.listWorkEntriesForTask(project.id, taskId)),
      project.gitEnabled
        ? loadListOrEmpty(() => api.listLinkedCommitsForTask(project.id, taskId))
        : Promise.resolve([]),
      loadListOrEmpty(() => api.listInboxItemsForTask(project.id, taskId)),
      loadListOrEmpty(() => api.listInboxItemsForProject(project.id))
    ]);
    if (!isCurrentProjectContext(revision)) {
      return false;
    }
    setSelectedNotes(notes);
    setSelectedWorkEntries(workEntries);
    setSelectedLinkedCommits(linkedCommits);
    setSelectedInboxItems([
      ...taskInboxItems,
      ...projectInboxItems.filter((item) => item.status === "open" && item.taskId === null)
    ]);
    return true;
  }

  async function refreshProjectData(projectId: string, revision: number) {
    let plan: ProjectPlanPayload;
    let resumeResult: ResumeLoadResult;
    try {
      [plan, resumeResult] = await Promise.all([
        api.loadProjectPlan(projectId),
        loadResumeBrief(projectId)
      ]);
    } catch (error) {
      if (!isCurrentProjectContext(revision)) {
        return false;
      }
      throw error;
    }
    if (!isCurrentProjectContext(revision)) {
      return false;
    }
    setProjectPlan(plan);
    setResumeBrief(resumeResult.brief);
    setResumeError(resumeResult.unavailable ? "Resume context unavailable." : null);
    return true;
  }

  async function loadProjectIntoState(
    activeProject: Project,
    loadedProjects: Project[],
    revision = beginProjectLoad()
  ) {
    let resumeResult: ResumeLoadResult;
    let gitResult: GitLoadResult;
    let plan: ProjectPlanPayload;
    try {
      [resumeResult, gitResult, plan] = await Promise.all([
        loadResumeBrief(activeProject.id),
        loadGitCommits(activeProject),
        api.loadProjectPlan(activeProject.id)
      ]);
    } catch (error) {
      if (!isCurrentProjectContext(revision)) {
        return null;
      }
      throw error;
    }
    if (!isCurrentProjectContext(revision)) {
      return null;
    }
    setProjects(loadedProjects);
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
    setScreen("today");
    setSetupMode("picker");
    setSelectedProjectId(activeProject.id);
    return revision;
  }

  async function openSavedProject(projectToOpen: Project) {
    try {
      await loadProjectIntoState(projectToOpen, projects);
    } catch {
      setSelectedProjectId(null);
      setLoadError("Could not load project plan.");
    }
  }

  async function deleteSavedProject(projectToDelete: Project) {
    if (deleteProjectInFlight.current) {
      return;
    }

    deleteProjectInFlight.current = true;
    setDeleteError(null);
    setDeletingProjectId(projectToDelete.id);
    try {
      await api.deleteProject(projectToDelete.id);
      setProjectSummaries(await loadProjectSummariesOrEmpty());
      const nextProjects = projectsRef.current.filter(
        (candidate) => candidate.id !== projectToDelete.id
      );
      const revision = beginProjectLoad();
      setProjects(nextProjects);

      const fallbackProject = nextProjects[0];
      if (!fallbackProject) {
        setSetupMode("create");
        return;
      }

      try {
        await loadProjectIntoState(fallbackProject, nextProjects, revision);
      } catch {
        setProjects(nextProjects);
        setPickerError("Could not load project plan.");
      }
    } catch {
      setDeleteError({
        projectId: projectToDelete.id,
        message: "Could not delete project."
      });
    } finally {
      deleteProjectInFlight.current = false;
      setDeletingProjectId(null);
    }
  }

  function closeProject() {
    invalidateProjectContext();
    resetProjectContext();
    setSetupMode("picker");
  }

  async function activateTask(taskId: string, revision: number) {
    if (!project) {
      return false;
    }

    await api.setActiveTask(project.id, taskId);
    if (!isCurrentProjectContext(revision)) {
      return false;
    }
    const activatedTask = projectPlan.tasks.find((candidate) => candidate.id === taskId) ?? null;

    setProjects((currentProjects) =>
      currentProjects.map((candidate) =>
        candidate.id === project.id ? { ...candidate, activeTaskId: taskId } : candidate
      )
    );
    setProjectPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => {
        if (task.projectId !== project.id) {
          return task;
        }
        if (task.id === taskId) {
          return { ...task, status: "active" };
        }
        return task.status === "active" ? { ...task, status: "todo" } : task;
      })
    }));
    setResumeBrief((brief) =>
      brief && brief.projectId === project.id
        ? {
            ...brief,
            taskId,
            stageId: activatedTask?.stageId ?? brief.stageId,
            nextStep: activatedTask?.nextStep ?? ""
          }
        : brief
    );
    return true;
  }

  async function openTask(
    taskId: string,
    options: { activate?: boolean } = {},
    revision = projectContextRevision.current
  ) {
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    if (options.activate) {
      if (!(await activateTask(taskId, revision))) {
        return;
      }
    }
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setSelectedTaskId(taskId);
    if (!(await loadTaskContext(taskId, revision))) {
      return;
    }
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setScreen("task-detail");
  }

  function showProjectScreen(nextScreen: AppScreen) {
    setTimelineError(null);
    setPortableError(null);
    setScreen(nextScreen);
  }

  async function openTimeline() {
    if (!project) {
      return;
    }

    const revision = projectContextRevision.current;

    setTimelineError(null);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    try {
      const [notes, workEntries, inboxItems] = await Promise.all([
        loadListOrEmpty(() => api.listNotesForProject(project.id)),
        loadListOrEmpty(() => api.listWorkEntriesForProject(project.id)),
        loadListOrEmpty(() => api.listInboxItemsForProject(project.id))
      ]);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setTimelineNotes(notes);
      setTimelineWorkEntries(workEntries);
      setTimelineInboxItems(inboxItems);
      setScreen("timeline");
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setTimelineError("Timeline unavailable.");
    }
  }

  function handleNavigate(destination: AppDestination) {
    if (destination === "timeline") {
      void openTimeline();
      return;
    }

    showProjectScreen(destination);
  }

  async function continueTask() {
    if (!todayTask) {
      return;
    }

    await openTask(todayTask.id);
  }

  function handleTodayPrimaryAction(view: ResumeBriefView) {
    if (view.state === "no-plan") {
      setScreen("import");
      return;
    }
    if (view.state === "no-active-task") {
      setScreen("plan");
      return;
    }
    void continueTask();
  }

  async function changeTaskStatus(taskId: string, status: TaskStatus) {
    const revision = projectContextRevision.current;
    await api.updateTaskStatus(taskId, status);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    if (project) {
      if (!(await refreshProjectData(project.id, revision))) {
        return;
      }
    }
    if (selectedTaskId === taskId) {
      await loadTaskContext(taskId, revision);
    }
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    const revision = projectContextRevision.current;
    await api.updateChecklistItem(itemId, completed);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
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

    const revision = projectContextRevision.current;
    const note = await api.addNote(project.id, taskId, body);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setSelectedNotes((notes) => [...notes, note]);
  }

  async function saveNextStep(taskId: string, nextStep: string) {
    const revision = projectContextRevision.current;
    await api.updateNextStep(taskId, nextStep);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setProjectPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, nextStep } : task))
    }));
    setResumeBrief((brief) =>
      brief?.taskId === taskId ? { ...brief, nextStep } : brief
    );
  }

  async function unlinkCommit(commitSha: string, taskId: string) {
    const revision = projectContextRevision.current;
    await api.unlinkCommit(commitSha, taskId);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    await loadTaskContext(taskId, revision);
  }

  async function moveCommit(commitSha: string, fromTaskId: string, toTaskId: string) {
    const revision = projectContextRevision.current;
    await api.moveCommitLink(commitSha, fromTaskId, toTaskId);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    await loadTaskContext(fromTaskId, revision);
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

  async function saveQuickCapture(input: {
    body: string;
    kind: InboxKind;
    taskId: string | null;
  }) {
    if (!project) {
      return;
    }

    const revision = projectContextRevision.current;
    const operationRevision = invalidateCaptureOperations();
    const item = await api.captureInboxItem({
      projectId: project.id,
      body: input.body,
      kind: input.kind
    });
    let savedItem = item;
    if (input.taskId) {
      try {
        savedItem = await api.attachInboxItemToTask({
          itemId: item.id,
          taskId: input.taskId
        });
      } catch (attachError) {
        try {
          await api.deleteInboxItem(item.id);
        } catch {
          // Best-effort rollback must not hide the original attach failure.
        }
        throw attachError;
      }
    }
    if (
      !isCurrentProjectContext(revision) ||
      captureOperationRevision.current !== operationRevision
    ) {
      return;
    }
    const currentSelectedTaskId = selectedTaskIdRef.current;
    if (screenRef.current === "task-detail" && currentSelectedTaskId) {
      setSelectedInboxItems((items) => {
        const nextItems = items.filter((candidate) => candidate.id !== savedItem.id);
        const belongsInRail =
          savedItem.projectId === project.id &&
          (savedItem.taskId === currentSelectedTaskId || savedItem.taskId === null);
        return belongsInRail ? [...nextItems, savedItem] : nextItems;
      });
    }
    const targetTask =
      projectPlan.tasks.find((candidate) => candidate.id === input.taskId) ?? null;
    setCaptureStatus(
      targetTask ? `Captured to Task: ${targetTask.title}` : "Captured to Inbox"
    );
  }

  async function captureInbox(input: { body: string; kind: InboxKind }) {
    await saveQuickCapture({ ...input, taskId: null });
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

    const revision = projectContextRevision.current;
    const focusTaskId = focusSession.taskId;
    const endedAtMs = focusSession.endedAtMs ?? Date.now();
    const workEntry = await api.createWorkEntry({
      projectId: project.id,
      taskId: focusTaskId,
      source: "focus",
      startedAt: new Date(focusSession.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationSeconds: input.durationSeconds,
      done: input.done,
      remains: input.remains,
      nextStep: input.nextStep
    });

    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setSelectedWorkEntries((entries) => [...entries, workEntry]);
    if (input.nextStep) {
      setProjectPlan((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) =>
          task.id === focusTaskId ? { ...task, nextStep: input.nextStep } : task
        )
      }));
      setResumeBrief((brief) =>
        brief?.taskId === focusTaskId ? { ...brief, nextStep: input.nextStep } : brief
      );
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

    const revision = projectContextRevision.current;
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

    if (!isCurrentProjectContext(revision)) {
      return;
    }
    if (!(await refreshProjectData(project.id, revision))) {
      return;
    }
    if (taskId) {
      await openTask(taskId, {}, revision);
    } else {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
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

    const revision = projectContextRevision.current;
    setImporting(true);
    setImportError(null);
    try {
      await api.importPlan(project.id, parsedPlan.stages);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      const loadedProjectSummaries = await loadProjectSummariesOrEmpty();
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setProjectSummaries(loadedProjectSummaries);
      if (!(await refreshProjectData(project.id, revision))) {
        return;
      }
      setMarkdownDraft("");
      setParsedPlan(null);
      setScreen("plan");
    } catch (error) {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Plan already has task history")) {
        setImportError("Could not import plan without losing existing task history.");
      } else {
        setImportError("Could not import plan.");
      }
    } finally {
      if (isCurrentProjectContext(revision)) {
        setImporting(false);
      }
    }
  }

  async function exportPortableBundle() {
    if (!project) {
      return;
    }

    const destination = bundleDestination.trim();
    if (!destination) {
      setPortableError("Destination folder is required.");
      setPortableStatus(null);
      return;
    }

    const revision = projectContextRevision.current;
    setPortableError(null);
    setPortableStatus(null);
    try {
      const exportedPath = await api.exportProjectBundle(project.id, destination);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableStatus(`Exported portable backup to ${exportedPath}`);
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not export portable bundle.");
    }
  }

  async function importPortableBundle() {
    let revision = projectContextRevision.current;
    const source = bundleFolder.trim();
    const localPath = reselectedLocalPath.trim();
    if (!source || !localPath) {
      setPortableError("Backup folder and local project folder are required.");
      setPortableStatus(null);
      return;
    }

    setPortableError(null);
    setPortableStatus(null);
    try {
      const importedProjectId = await api.importProjectBundle(source, localPath);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      const loadedProjects = await api.listProjects();
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      const importedProject = loadedProjects.find(
        (candidate) => candidate.id === importedProjectId
      );
      if (!importedProject) {
        throw new Error("Imported project was not returned by list_projects.");
      }
      revision = beginProjectLoad();
      const loadedRevision = await loadProjectIntoState(
        importedProject,
        loadedProjects,
        revision
      );
      if (loadedRevision === null || !isCurrentProjectContext(loadedRevision)) {
        return;
      }
      setScreen("utilities");
      setPortableStatus("Imported portable project.");
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not import portable bundle.");
    }
  }

  async function choosePortableFolder(onSelect: (selected: string) => void) {
    const revision = projectContextRevision.current;
    try {
      const selected = await chooseFolder();
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      if (selected) {
        onSelect(selected);
        setPortableError(null);
      }
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not open folder picker.");
    }
  }

  async function chooseBundleDestination() {
    await choosePortableFolder(setBundleDestination);
  }

  async function chooseBundleFolder() {
    await choosePortableFolder(setBundleFolder);
  }

  async function chooseLocalProjectFolder() {
    await choosePortableFolder(setReselectedLocalPath);
  }

  function renderProjectScreen() {
    if (screen === "import") {
      return (
        <section className="stack">
          <ScreenHeader
            eyebrow="Project"
            title="Import plan"
            description="Preview a Markdown task plan before writing it to the local project."
          />
          {importError ? <InlineAlert tone="error">{importError}</InlineAlert> : null}
          <Surface ariaLabel="Markdown import" className="markdown-import">
            <TextArea
              id="markdown-plan"
              label="Markdown plan"
              value={markdownDraft}
              disabled={importing}
              onChange={(event) => setMarkdownDraft(event.target.value)}
            />
            <Button
              type="button"
              className="markdown-import__action"
              disabled={importing}
              onClick={previewImport}
            >
              Preview import
            </Button>
          </Surface>
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

    if (screen === "plan") {
      return (
        <Planner
          frames={buildPlannerFrames(
            projectPlan.stages,
            projectPlan.tasks,
            projectPlan.checklistItems,
            project?.activeTaskId ?? null
          )}
          onOpenTask={(taskId, options) => void openTask(taskId, options)}
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

    if (screen === "utilities" && project) {
      return (
        <Utilities
          projectPath={project.localPath}
          gitEnabled={project.gitEnabled}
          gitHealth={gitError}
          markdownExport={markdownExport}
          bundleDestination={bundleDestination}
          bundleFolder={bundleFolder}
          reselectedLocalPath={reselectedLocalPath}
          portableStatus={portableStatus}
          portableError={portableError}
          onOpenImport={() => setScreen("import")}
          onChooseBundleDestination={() => void chooseBundleDestination()}
          onChooseBundleFolder={() => void chooseBundleFolder()}
          onChooseLocalProjectFolder={() => void chooseLocalProjectFolder()}
          onExportPortableBundle={() => void exportPortableBundle()}
          onImportPortableBundle={() => void importPortableBundle()}
        />
      );
    }

    if (screen === "task-detail" && selectedTask) {
      const selectedStage =
        projectPlan.stages.find((stage) => stage.id === selectedTask.stageId) ?? null;
      return (
        <TaskDetail
          task={selectedTask}
          stageTitle={selectedStage?.title}
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

    const todayView = buildTodayView(resumeBrief, projectPlan, todayTask, gitCommits);

    return (
      <Today
        view={todayView}
        onPrimaryAction={() => handleTodayPrimaryAction(todayView)}
        onCaptureInbox={captureInbox}
        onStartManualWorkReview={() => startManualWorkReview(todayTask?.id ?? null)}
        canUsePrimaryAction={todayView.state !== "ready" || Boolean(todayTask)}
      />
    );
  }

  if (loading) {
    return (
      <AppShell activeDestination="setup">
        <Surface ariaLabel="Loading">
          <ScreenHeader title="Opening Desclop" description="Loading local project context." />
        </Surface>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell activeDestination="setup">
        <Surface ariaLabel="Project loading failed" className="start-flow">
          <ScreenHeader
            title="Project loading failed"
            description="Desclop could not open the local project context."
          />
          <InlineAlert tone="error">{loadError}</InlineAlert>
          <Button type="button" onClick={loadProjects}>
            Retry
          </Button>
        </Surface>
      </AppShell>
    );
  }

  if (projects.length === 0) {
    return (
      <AppShell activeDestination="setup">
        <ProjectSetup
          creating={creating}
          error={createError}
          onCreate={createProject}
        />
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell activeDestination="setup">
        {setupMode === "create" ? (
          <ProjectSetup
            creating={creating}
            error={createError}
            onCreate={createProject}
          />
        ) : (
          <>
            {pickerError ? <InlineAlert tone="error">{pickerError}</InlineAlert> : null}
            <ProjectPicker
              projects={projects}
              projectSummaries={projectSummaries}
              homePath=""
              onOpenProject={openSavedProject}
              onDeleteProject={deleteSavedProject}
              onDeleteDialogChange={(projectId) => {
                if (!projectId || deleteError?.projectId === projectId) {
                  setDeleteError(null);
                }
              }}
              deletingProjectId={deletingProjectId}
              deleteError={deleteError}
              onCreateProject={() => {
                setCreateError(null);
                setSetupMode("create");
              }}
            />
          </>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      activeDestination={activeDestinationForScreen(screen)}
      projectName={project?.name}
      projectStatus={resumeError || gitError ? [resumeError, gitError].filter(Boolean).join(" ") : null}
      onNavigate={handleNavigate}
      onQuickCapture={openQuickCapture}
      onCloseProject={closeProject}
    >
      {resumeError || gitError ? (
        <InlineAlert tone="warning">
          {[resumeError, gitError].filter(Boolean).join(" ")}
        </InlineAlert>
      ) : null}
      {timelineError ? <InlineAlert tone="error">{timelineError}</InlineAlert> : null}
      {captureStatus ? <InlineAlert tone="info">{captureStatus}</InlineAlert> : null}
      {renderProjectScreen()}
      <QuickCaptureOverlay
        open={quickCaptureOpen}
        tasks={projectPlan.tasks}
        defaultTaskId={quickCaptureDefaultTaskId}
        onSave={saveQuickCapture}
        onClose={closeQuickCapture}
      />
    </AppShell>
  );
}

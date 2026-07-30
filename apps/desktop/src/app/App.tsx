import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../styles/base.css";
import { exportProjectMarkdowns } from "../features/export-import/markdownExport";
import {
  findDefaultContextTaskId,
  findPlanIdForTask,
  orderTasks
} from "../features/context-export/contextExport";
import { FocusMode } from "../features/focus-mode/FocusMode";
import { MarkdownFilePicker } from "../features/markdown-import/MarkdownFilePicker";
import { MarkdownImportPreview } from "../features/markdown-import/MarkdownImportPreview";
import { FirstRunHint } from "../features/onboarding/FirstRunHint";
import { FirstRunHelp } from "../features/onboarding/FirstRunHelp";
import {
  CANONICAL_MARKDOWN_TEMPLATE,
  canImportParsedPlan,
  parseMarkdownPlan,
  type ParsedMarkdownPlan
} from "../features/markdown-import/markdownParser";
import { Planner, type PlanEditorDraft } from "../features/planner/Planner";
import { PortableRestoreForm } from "../features/portable-backup/PortableRestoreForm";
import { buildPlanFrames } from "../features/planner/plannerEngine";
import {
  readArchivedPlanIds,
  writeArchivedPlanIds
} from "../features/planner/plannerArchive";
import { QuickCaptureOverlay } from "../features/quick-capture/QuickCaptureOverlay";
import { Settings } from "../features/settings/SettingsPage";
import { applySettingsToDocument } from "../features/settings/settingsPresentation";
import {
  getInitialSettings,
  shortcutMatchesKeyboardEvent,
  writeSettings,
  type AppSettings
} from "../features/settings/settings";
import {
  ProjectPicker,
  type ProjectDeleteError
} from "../features/project-setup/ProjectPicker";
import { ProjectSetup } from "../features/project-setup/ProjectSetup";
import { getProjectFolderError } from "../features/project-setup/projectFolder";
import {
  readLastProjectId,
  writeLastProjectId
} from "../features/project-setup/projectSelection";
import { TaskDetail, type StartFocusInput } from "../features/task-detail/TaskDetail";
import { Timeline } from "../features/timeline/Timeline";
import { Today } from "../features/today/Today";
import { buildResumeBriefView, type ResumeBriefView } from "../features/today/resumeEngine";
import { Utilities, type MarkdownExportItem } from "../features/utilities/Utilities";
import {
  WeeklyReview,
  type WeeklyReviewTimelineTarget
} from "../features/weekly-review/WeeklyReview";
import { buildWeeklyReview } from "../features/weekly-review/weeklyReviewEngine";
import { WorkReview } from "../features/work-log/WorkReview";
import {
  api,
  type CreateProjectInput,
  type DatabaseRuntimeStatus,
  type PortableBundlePreview,
  type ProjectDiagnostics,
  type ProjectPlanPayload
} from "../shared/api/client";
import {
  chooseFolder,
  chooseMarkdownFile,
  choosePortableBackupFile
} from "../shared/api/folderDialog";
import { formatUserFacingError } from "../shared/errors/safeError";
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
  TextArea,
  Toast,
  type ToastTone
} from "../shared/ui";
import { AppShell, type AppDestination } from "./shell/AppShell";

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readLastOpenedProjectId() {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? readLastProjectId(window.localStorage)
      : null;
  } catch {
    return null;
  }
}

function rememberLastOpenedProject(projectId: string) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      writeLastProjectId(window.localStorage, projectId);
    }
  } catch {
    // Local persistence is optional and must not block opening a project.
  }
}

function readArchivedPlansForProject(projectId: string) {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? readArchivedPlanIds(window.localStorage, projectId)
      : [];
  } catch {
    return [];
  }
}

function writeArchivedPlansForProject(projectId: string, planIds: string[]) {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? writeArchivedPlanIds(window.localStorage, projectId, planIds)
      : false;
  } catch {
    return false;
  }
}

const QUICK_CAPTURE_OPEN_EVENT = "quick-capture:open";

interface ResumeLoadResult {
  brief: ResumeBrief | null;
  unavailable: boolean;
}

interface GitLoadResult {
  commits: GitCommit[];
  currentBranch: string | null;
  unavailable: boolean;
  syncedAt: string | null;
}

type AppScreen =
  | "today"
  | "weekly-review"
  | "task-detail"
  | "focus"
  | "work-review"
  | "manual-work-review"
  | "import"
  | "plan"
  | "timeline"
  | "utilities"
  | "settings"
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

interface AppToast {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

const TOAST_AUTO_DISMISS_MS = 1500;

async function loadResumeBrief(projectId: string): Promise<ResumeLoadResult> {
  try {
    return { brief: await api.getResumeBrief(projectId), unavailable: false };
  } catch {
    return { brief: null, unavailable: true };
  }
}

async function loadGitCommits(project: Project): Promise<GitLoadResult> {
  if (!project.gitEnabled) {
    return { commits: [], currentBranch: null, unavailable: false, syncedAt: null };
  }

  try {
    const [commits, currentBranch] = await Promise.all([
      api.syncGitCommits(project.id),
      api.readCurrentGitBranch(project.id)
    ]);
    return {
      commits,
      currentBranch: currentBranch ?? null,
      unavailable: false,
      syncedAt: new Date().toISOString()
    };
  } catch {
    return { commits: [], currentBranch: null, unavailable: true, syncedAt: null };
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
  commits: GitCommit[],
  currentBranch: string | null
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
    currentBranch,
    commits,
    workEntries: [],
    inboxItems: [],
    nextTasks,
    hasPlan: plan.tasks.length > 0 || plan.stages.length > 0
  });
}

function nextPlanTitle(plan: ProjectPlanPayload) {
  return `Plan ${(plan.plans?.length ?? 0) + 1}`;
}

function activeDestinationForScreen(screen: AppScreen): AppDestination {
  if (
    screen === "plan" ||
    screen === "timeline" ||
    screen === "import" ||
    screen === "utilities" ||
    screen === "settings"
  ) {
    return screen;
  }

  if (screen === "weekly-review") {
    return "review";
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
  const contextExportOperationRevision = useRef(0);
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
  const [setupMode, setSetupMode] = useState<"picker" | "create" | "restore">("picker");
  const [loading, setLoading] = useState(true);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseRuntimeStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitErrorDismissed, setGitErrorDismissed] = useState(false);
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [gitCurrentBranch, setGitCurrentBranch] = useState<string | null>(null);
  const [gitLastSyncedAt, setGitLastSyncedAt] = useState<string | null>(null);
  const [resumeBrief, setResumeBrief] = useState<ResumeBrief | null>(null);
  const [projectPlan, setProjectPlan] = useState<ProjectPlanPayload>({
    plans: [],
    stages: [],
    tasks: [],
    checklistItems: []
  });
  const [archivedPlanIds, setArchivedPlanIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>("today");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Note[]>([]);
  const [selectedWorkEntries, setSelectedWorkEntries] = useState<WorkEntry[]>([]);
  const [selectedLinkedCommits, setSelectedLinkedCommits] = useState<GitCommit[]>([]);
  const [selectedInboxItems, setSelectedInboxItems] = useState<InboxItem[]>([]);
  const [timelineNotes, setTimelineNotes] = useState<Note[]>([]);
  const [timelineWorkEntries, setTimelineWorkEntries] = useState<WorkEntry[]>([]);
  const [timelineInboxItems, setTimelineInboxItems] = useState<InboxItem[]>([]);
  const [timelineDateKey, setTimelineDateKey] = useState<string | null>(null);
  const [timelineFocusItemKey, setTimelineFocusItemKey] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Note[]>([]);
  const [reviewWorkEntries, setReviewWorkEntries] = useState<WorkEntry[]>([]);
  const [reviewInboxItems, setReviewInboxItems] = useState<InboxItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);
  const [manualReviewTaskId, setManualReviewTaskId] = useState<string | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownFileName, setMarkdownFileName] = useState<string | null>(null);
  const [parsedPlan, setParsedPlan] = useState<ParsedMarkdownPlan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [bundleDestination, setBundleDestination] = useState("");
  const [bundleFolder, setBundleFolder] = useState("");
  const [reselectedLocalPath, setReselectedLocalPath] = useState("");
  const [portableStatus, setPortableStatus] = useState<string | null>(null);
  const [portableError, setPortableError] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<PortableBundlePreview | null>(null);
  const [diagnostics, setDiagnostics] = useState<ProjectDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [contextExportPlanId, setContextExportPlanId] = useState<string | null>(null);
  const [contextExportTaskId, setContextExportTaskId] = useState<string | null>(null);
  const [contextExportNotes, setContextExportNotes] = useState<Note[]>([]);
  const [contextExportWorkEntries, setContextExportWorkEntries] = useState<WorkEntry[]>([]);
  const [contextExportLinkedCommits, setContextExportLinkedCommits] = useState<GitCommit[]>([]);
  const [contextExportLoading, setContextExportLoading] = useState(false);
  const [contextExportError, setContextExportError] = useState<string | null>(null);
  const [relinkPath, setRelinkPath] = useState("");
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickCaptureDefaultTaskId, setQuickCaptureDefaultTaskId] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => getInitialSettings());
  const settingsRef = useRef(settings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<AppToast | null>(null);
  const toastSequence = useRef(0);

  function invalidateProjectContext() {
    projectContextRevision.current += 1;
    return projectContextRevision.current;
  }

  function isCurrentProjectContext(revision: number) {
    return projectContextRevision.current === revision;
  }

  function markProjectRecentlyChanged(projectId: string) {
    setProjects((currentProjects) => {
      const changedProject = currentProjects.find((candidate) => candidate.id === projectId);
      if (!changedProject) {
        return currentProjects;
      }
      return [
        { ...changedProject, updatedAt: new Date().toISOString() },
        ...currentProjects.filter((candidate) => candidate.id !== projectId)
      ];
    });
  }

  function invalidateCaptureOperations() {
    captureOperationRevision.current += 1;
    return captureOperationRevision.current;
  }

  function getSettingsErrorMessage(subject: string, error: unknown) {
    return formatUserFacingError(subject, error);
  }

  function showToast(tone: ToastTone, title: string, message: string) {
    toastSequence.current += 1;
    setToast({ id: toastSequence.current, tone, title, message });
  }

  async function applyInitialNativeSettings() {
    if (!hasTauriInternals()) {
      return;
    }

    try {
      await api.setCloseBehavior(settings.closeBehavior);
    } catch (error) {
      setSettingsError(getSettingsErrorMessage("Window behavior", error));
    }

    try {
      await api.setCaptureShortcut(settings.captureShortcut);
    } catch (error) {
      setSettingsError(getSettingsErrorMessage("Capture shortcut", error));
    }

    try {
      await getCurrentWindow().setResizable(settings.windowResizable);
    } catch (error) {
      setSettingsError(getSettingsErrorMessage("Window resizing", error));
    }
  }

  async function changeSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      if (hasTauriInternals() && key === "closeBehavior") {
        await api.setCloseBehavior(value as AppSettings["closeBehavior"]);
      }
      if (hasTauriInternals() && key === "captureShortcut") {
        await api.setCaptureShortcut(value as string);
      }
      if (hasTauriInternals() && key === "windowResizable") {
        await getCurrentWindow().setResizable(value as boolean);
      }
    } catch (error) {
      setSettingsError(getSettingsErrorMessage("Settings change", error));
      return;
    }

    const nextSettings = { ...settingsRef.current, [key]: value } as AppSettings;
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    let saved = false;
    try {
      saved =
        typeof window !== "undefined" && window.localStorage
          ? writeSettings(window.localStorage, nextSettings)
          : false;
    } catch {
      saved = false;
    }
    setSettingsStatus(saved ? "Settings saved on this machine." : "Settings applied for this session.");
  }

  function quitApplication() {
    if (!hasTauriInternals()) {
      setSettingsStatus("Quit is available in the desktop app.");
      return;
    }

    void Promise.resolve(api.quitApp()).catch((error) => {
      setSettingsError(getSettingsErrorMessage("Quit", error));
    });
  }

  function resetProjectContext() {
    invalidateCaptureOperations();
    setSelectedProjectId(null);
    setLoadError(null);
    setPickerError(null);
    setResumeError(null);
    setGitError(null);
    setGitErrorDismissed(false);
    setGitCommits([]);
    setGitLastSyncedAt(null);
    setResumeBrief(null);
    setProjectPlan({ plans: [], stages: [], tasks: [], checklistItems: [] });
    setArchivedPlanIds([]);
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
    setTimelineDateKey(null);
    setTimelineFocusItemKey(null);
    setTimelineError(null);
    setReviewNotes([]);
    setReviewWorkEntries([]);
    setReviewInboxItems([]);
    setReviewLoading(false);
    setReviewError(null);
    setFocusSession(null);
    setManualReviewTaskId(null);
    setMarkdownDraft("");
    setMarkdownFileName(null);
    setParsedPlan(null);
    setImportError(null);
    setImporting(false);
    setBundleDestination("");
    setBundleFolder("");
    setReselectedLocalPath("");
    setPortableStatus(null);
    setPortableError(null);
    setRestorePreview(null);
    setDiagnostics(null);
    setDiagnosticsLoading(false);
    setDiagnosticsError(null);
    contextExportOperationRevision.current += 1;
    setContextExportPlanId(null);
    setContextExportTaskId(null);
    setContextExportNotes([]);
    setContextExportWorkEntries([]);
    setContextExportLinkedCommits([]);
    setContextExportLoading(false);
    setContextExportError(null);
    setRelinkPath("");
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
      setDatabaseStatus(null);
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
      const nextDatabaseStatus = await api.getDatabaseStatus();
      setDatabaseStatus(nextDatabaseStatus);
      if (nextDatabaseStatus.state !== "ready") {
        return;
      }
      const [loadedProjects, loadedProjectSummaries] = await Promise.all([
        api.listProjects(),
        loadProjectSummariesOrEmpty()
      ]);
      setProjects(loadedProjects);
      setProjectSummaries(loadedProjectSummaries);
      const lastProjectId = readLastOpenedProjectId();
      const initialProject =
        loadedProjects.find((project) => project.id === lastProjectId) ?? loadedProjects[0];
      if (initialProject) {
        try {
          await loadProjectIntoState(initialProject, loadedProjects);
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
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);

  useEffect(() => {
    void applyInitialNativeSettings();
    // Native settings are initialized once from the persisted snapshot.
    // Later changes are applied transactionally in changeSetting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timerId);
  }, [toast]);

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
          project,
          ...projectsRef.current.filter((candidate) => candidate.id !== project.id)
        ];
        await loadProjectIntoState(project, nextProjects);
      } catch {
        setLoadError("Could not load project plan.");
        return;
      }
    } catch (error) {
      setCreateError(getProjectFolderError(error, "Could not create project."));
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
  const markdownExports: MarkdownExportItem[] = project
    ? exportProjectMarkdowns({
        projectName: project.name,
        plans: projectPlan.plans ?? [],
        stages: projectPlan.stages,
        tasks: projectPlan.tasks,
        checklistItems: projectPlan.checklistItems
      })
    : [];

  const openQuickCapture = useCallback(() => {
    if (!projectId || quickCaptureOpen) {
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
    quickCaptureOpen,
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
      if (shortcutMatchesKeyboardEvent(settings.captureShortcut, event)) {
        event.preventDefault();
        openQuickCapture();
      }
    }

    window.addEventListener("keydown", handleQuickCaptureShortcut);
    return () => window.removeEventListener("keydown", handleQuickCaptureShortcut);
  }, [openQuickCapture, settings.captureShortcut]);

  useEffect(() => {
    if (!hasTauriInternals()) {
      return;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    void listen(QUICK_CAPTURE_OPEN_EVENT, () => {
      openQuickCapture();
    })
      .then((nextUnlisten) => {
        if (active) {
          unlisten = nextUnlisten;
          return;
        }

        nextUnlisten();
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, [openQuickCapture]);

  async function loadTaskContext(
    taskId: string,
    revision: number,
    isRelevant: () => boolean = () => true
  ) {
    if (!project || !isRelevant()) {
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
    if (!isCurrentProjectContext(revision) || !isRelevant()) {
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

  async function refreshGitData(activeProject: Project, revision: number) {
    const gitResult = await loadGitCommits(activeProject);
    if (!isCurrentProjectContext(revision)) {
      return false;
    }
    if (!gitResult.unavailable) {
      setGitCommits(gitResult.commits);
      setGitCurrentBranch(gitResult.currentBranch);
      setGitLastSyncedAt(gitResult.syncedAt);
    }
    setGitError(gitResult.unavailable ? "Git unavailable." : null);
    return true;
  }

  useEffect(() => {
    if (!project?.gitEnabled) {
      return;
    }

    let disposed = false;
    let syncing = false;
    const activeProject = project;

    function refreshAfterReturningToTheApp() {
      if (syncing) {
        return;
      }
      syncing = true;
      const revision = projectContextRevision.current;
      void (async () => {
        try {
          if (!(await refreshGitData(activeProject, revision)) || disposed) {
            return;
          }
          const taskId = selectedTaskIdRef.current;
          const isSelectedTask = () =>
            screenRef.current === "task-detail" && selectedTaskIdRef.current === taskId;
          if (taskId && isSelectedTask()) {
            await loadTaskContext(taskId, revision, isSelectedTask);
          }
        } finally {
          syncing = false;
        }
      })();
    }

    window.addEventListener("focus", refreshAfterReturningToTheApp);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshAfterReturningToTheApp);
    };
  }, [project?.gitEnabled, project?.id]);

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

  async function savePlanEditor(draft: PlanEditorDraft) {
    const activeProject = project;
    if (!activeProject) {
      throw new Error("No project is open.");
    }

    const revision = projectContextRevision.current;
    await api.savePlanEditor({
      planId: draft.planId,
      title: draft.title.trim(),
      stages: draft.stages.map((stage, position) => ({
        stageId: stage.isNew ? null : stage.id,
        title: stage.title.trim(),
        description: stage.description,
        position
      })),
      deletedStageIds: draft.deletedStageIds
    });
    markProjectRecentlyChanged(activeProject.id);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    await refreshProjectData(activeProject.id, revision);
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
    setGitCurrentBranch(gitResult.currentBranch);
    setGitLastSyncedAt(gitResult.syncedAt);
    setGitError(gitResult.unavailable ? "Git unavailable." : null);
    setGitErrorDismissed(false);
    setProjectPlan(plan);
    setArchivedPlanIds(readArchivedPlansForProject(activeProject.id));
    setSelectedTaskId(null);
    setSelectedNotes([]);
    setSelectedWorkEntries([]);
    setSelectedLinkedCommits([]);
    setSelectedInboxItems([]);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    setTimelineDateKey(null);
    setTimelineFocusItemKey(null);
    setFocusSession(null);
    setScreen("today");
    setSetupMode("picker");
    setSelectedProjectId(activeProject.id);
    rememberLastOpenedProject(activeProject.id);
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

    const projectId = project.id;
    await api.setActiveTask(projectId, taskId);
    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision)) {
      return false;
    }
    const activatedTask = projectPlan.tasks.find((candidate) => candidate.id === taskId) ?? null;

    setProjects((currentProjects) =>
      currentProjects.map((candidate) =>
        candidate.id === projectId ? { ...candidate, activeTaskId: taskId } : candidate
      )
    );
    setProjectPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => {
        if (task.projectId !== projectId) {
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

  function nextContextExportOperationRevision() {
    contextExportOperationRevision.current += 1;
    return contextExportOperationRevision.current;
  }

  function isCurrentContextExportOperation(projectRevision: number, operationRevision: number) {
    return (
      isCurrentProjectContext(projectRevision) &&
      contextExportOperationRevision.current === operationRevision
    );
  }

  async function loadContextExportTask(taskId: string | null, projectRevision: number) {
    const operationRevision = nextContextExportOperationRevision();
    setContextExportError(null);
    setContextExportLoading(Boolean(taskId));

    if (!project || !taskId) {
      setContextExportNotes([]);
      setContextExportWorkEntries([]);
      setContextExportLinkedCommits([]);
      setContextExportLoading(false);
      return;
    }

    try {
      const [notes, workEntries, linkedCommits] = await Promise.all([
        Promise.resolve(api.listNotesForTask(project.id, taskId)).then((items) => items ?? []),
        Promise.resolve(api.listWorkEntriesForTask(project.id, taskId)).then(
          (items) => items ?? []
        ),
        project.gitEnabled
          ? Promise.resolve(api.listLinkedCommitsForTask(project.id, taskId)).then(
              (items) => items ?? []
            )
          : Promise.resolve([])
      ]);
      if (!isCurrentContextExportOperation(projectRevision, operationRevision)) {
        return;
      }
      setContextExportNotes(notes);
      setContextExportWorkEntries(workEntries);
      setContextExportLinkedCommits(linkedCommits);
    } catch {
      if (!isCurrentContextExportOperation(projectRevision, operationRevision)) {
        return;
      }
      setContextExportNotes([]);
      setContextExportWorkEntries([]);
      setContextExportLinkedCommits([]);
      setContextExportError("Could not read local task context.");
    } finally {
      if (isCurrentContextExportOperation(projectRevision, operationRevision)) {
        setContextExportLoading(false);
      }
    }
  }

  async function prepareContextExport() {
    if (!project) {
      return;
    }

    const projectRevision = projectContextRevision.current;
    const tasks = projectPlan.tasks;
    const plans = projectPlan.plans ?? [];
    const nextTaskId =
      contextExportTaskId && tasks.some((task) => task.id === contextExportTaskId)
        ? contextExportTaskId
        : findDefaultContextTaskId({
            project,
            resumeTaskId: resumeBrief?.taskId ?? null,
            plans,
            stages: projectPlan.stages,
            tasks
          });
    const nextPlanId =
      findPlanIdForTask(nextTaskId, tasks, projectPlan.stages) ??
      (contextExportPlanId && plans.some((plan) => plan.id === contextExportPlanId)
        ? contextExportPlanId
        : plans[0]?.id ?? null);

    setContextExportTaskId(nextTaskId);
    setContextExportPlanId(nextPlanId);
    await loadContextExportTask(nextTaskId, projectRevision);
  }

  function handleContextExportTaskChange(taskId: string) {
    if (!project) {
      return;
    }

    const nextTaskId = taskId || null;
    const nextPlanId =
      findPlanIdForTask(nextTaskId, projectPlan.tasks, projectPlan.stages) ?? contextExportPlanId;
    setContextExportTaskId(nextTaskId);
    setContextExportPlanId(nextPlanId);
    void loadContextExportTask(nextTaskId, projectContextRevision.current);
  }

  function handleContextExportPlanChange(planId: string) {
    if (!project) {
      return;
    }

    const nextPlanId = planId || null;
    const plans = projectPlan.plans ?? [];
    const planTasks = projectPlan.tasks.filter((task) => {
      const stage = projectPlan.stages.find((candidate) => candidate.id === task.stageId);
      return (
        !nextPlanId ||
        stage?.planId === nextPlanId ||
        (plans.length === 1 && !stage?.planId && plans[0]?.id === nextPlanId)
      );
    });
    const currentTaskStillBelongs = planTasks.some(
      (task) => task.id === contextExportTaskId
    );
    const nextTaskId = currentTaskStillBelongs
      ? contextExportTaskId
      : orderTasks(planTasks, nextPlanId ? plans.filter((plan) => plan.id === nextPlanId) : plans, projectPlan.stages)[0]?.id ?? null;

    setContextExportPlanId(nextPlanId);
    setContextExportTaskId(nextTaskId);
    void loadContextExportTask(nextTaskId, projectContextRevision.current);
  }

  function showProjectScreen(nextScreen: AppScreen) {
    setTimelineError(null);
    setReviewError(null);
    setPortableError(null);
    setScreen(nextScreen);
    if (nextScreen === "utilities") {
      void refreshProjectDiagnostics();
      void prepareContextExport();
    }
  }

  function archivePlan(planId: string) {
    if (!project) {
      return;
    }

    const nextPlanIds = [...new Set([...archivedPlanIds, planId])];
    setArchivedPlanIds(nextPlanIds);
    writeArchivedPlansForProject(project.id, nextPlanIds);
  }

  function restorePlan(planId: string) {
    if (!project) {
      return;
    }

    const nextPlanIds = archivedPlanIds.filter((candidate) => candidate !== planId);
    setArchivedPlanIds(nextPlanIds);
    writeArchivedPlansForProject(project.id, nextPlanIds);
  }

  async function openTimeline(target: WeeklyReviewTimelineTarget = {}) {
    if (!project) {
      return;
    }

    const revision = projectContextRevision.current;

    setTimelineError(null);
    setTimelineNotes([]);
    setTimelineWorkEntries([]);
    setTimelineInboxItems([]);
    setTimelineDateKey(target.dateKey ?? null);
    setTimelineFocusItemKey(target.itemKey ?? null);
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

  async function openWeeklyReview() {
    if (!project) {
      return;
    }

    const revision = projectContextRevision.current;
    setScreen("weekly-review");
    setReviewLoading(true);
    setReviewError(null);
    try {
      const [notes, workEntries, inboxItems, gitResult] = await Promise.all([
        loadListOrEmpty(() => api.listNotesForProject(project.id)),
        loadListOrEmpty(() => api.listWorkEntriesForProject(project.id)),
        loadListOrEmpty(() => api.listInboxItemsForProject(project.id)),
        loadGitCommits(project)
      ]);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setReviewNotes(notes);
      setReviewWorkEntries(workEntries);
      setReviewInboxItems(inboxItems);
      if (!gitResult.unavailable) {
        setGitCommits(gitResult.commits);
        setGitCurrentBranch(gitResult.currentBranch);
        setGitLastSyncedAt(gitResult.syncedAt);
      }
      setGitError(gitResult.unavailable ? "Git unavailable." : null);
      setScreen("weekly-review");
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setReviewError("Weekly Review unavailable.");
    } finally {
      if (isCurrentProjectContext(revision)) {
        setReviewLoading(false);
      }
    }
  }

  function handleNavigate(destination: AppDestination) {
    if (destination === "settings") {
      setScreen("settings");
      return;
    }

    if (destination === "timeline") {
      void openTimeline();
      return;
    }

    if (destination === "review") {
      void openWeeklyReview();
      return;
    }

    showProjectScreen(destination);
  }

  function openHelp() {
    setHelpOpen(true);
  }

  function leaveSettingsToProjectSetup() {
    setSettingsError(null);
    setSettingsStatus(null);
    setScreen("setup");
    setSetupMode(projects.length > 0 ? "picker" : "create");
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
    const activeProject = project;
    if (!activeProject) {
      return;
    }

    const revision = projectContextRevision.current;
    if (status === "done" && activeProject.gitEnabled) {
      await refreshGitData(activeProject, revision);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
    }
    await api.updateTaskStatus(taskId, status);
    markProjectRecentlyChanged(activeProject.id);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    if (!(await refreshProjectData(activeProject.id, revision))) {
      return;
    }
    if (selectedTaskId === taskId) {
      await loadTaskContext(taskId, revision);
    }
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }

    const revision = projectContextRevision.current;
    await api.updateChecklistItem(itemId, completed);
    markProjectRecentlyChanged(projectId);
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

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const note = await api.addNote(projectId, taskId, body);
    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setSelectedNotes((notes) => [...notes, note]);
  }

  async function saveNextStep(taskId: string, nextStep: string) {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }

    const revision = projectContextRevision.current;
    await api.updateNextStep(taskId, nextStep);
    markProjectRecentlyChanged(projectId);
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
    const projectId = project?.id;
    if (!projectId) {
      return;
    }

    const revision = projectContextRevision.current;
    const isRelevant = () =>
      screenRef.current === "task-detail" && selectedTaskIdRef.current === taskId;
    await api.unlinkCommit(commitSha, taskId);
    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision) || !isRelevant()) {
      return;
    }
    await loadTaskContext(taskId, revision, isRelevant);
  }

  async function moveCommit(commitSha: string, fromTaskId: string, toTaskId: string) {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }

    const revision = projectContextRevision.current;
    const isRelevant = () =>
      screenRef.current === "task-detail" && selectedTaskIdRef.current === fromTaskId;
    await api.moveCommitLink(commitSha, fromTaskId, toTaskId);
    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision) || !isRelevant()) {
      return;
    }
    await loadTaskContext(fromTaskId, revision, isRelevant);
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

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const operationRevision = invalidateCaptureOperations();
    const item = await api.captureInboxItem({
      projectId,
      body: input.body,
      kind: input.kind
    });
    if (
      !isCurrentProjectContext(revision) ||
      captureOperationRevision.current !== operationRevision
    ) {
      markProjectRecentlyChanged(projectId);
      return;
    }
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
          markProjectRecentlyChanged(projectId);
          if (
            !isCurrentProjectContext(revision) ||
            captureOperationRevision.current !== operationRevision
          ) {
            return;
          }

          const currentSelectedTaskId = selectedTaskIdRef.current;
          if (screenRef.current === "task-detail" && currentSelectedTaskId) {
            try {
              const [taskInboxItems, projectInboxItems] = await Promise.all([
                api.listInboxItemsForTask(project.id, currentSelectedTaskId),
                api.listInboxItemsForProject(project.id)
              ]);
              if (
                !isCurrentProjectContext(revision) ||
                captureOperationRevision.current !== operationRevision ||
                screenRef.current !== "task-detail" ||
                selectedTaskIdRef.current !== currentSelectedTaskId
              ) {
                return;
              }
              setSelectedInboxItems([
                ...taskInboxItems,
                ...projectInboxItems.filter(
                  (candidate) => candidate.status === "open" && candidate.taskId === null
                )
              ]);
            } catch {
              // Preserve the existing rail when recovery reads are unavailable.
            }
          }

          if (
            isCurrentProjectContext(revision) &&
            captureOperationRevision.current === operationRevision
          ) {
            setCaptureStatus(
              "Capture was saved, but task attachment could not be confirmed. Check Inbox before retrying."
            );
          }
          return;
        }
        throw attachError;
      }
    }
    markProjectRecentlyChanged(projectId);
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
          savedItem.projectId === projectId &&
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
    noMeaningfulProgress: boolean;
  }) {
    if (!project || !focusSession) {
      return;
    }

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const focusTaskId = focusSession.taskId;
    const endedAtMs = focusSession.endedAtMs ?? Date.now();
    const workEntry = await api.createWorkEntry({
      projectId,
      taskId: focusTaskId,
      source: "focus",
      startedAt: new Date(focusSession.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationSeconds: input.durationSeconds,
      done: input.noMeaningfulProgress && !input.done ? "No meaningful progress" : input.done,
      remains: input.remains,
      nextStep: input.nextStep
    });

    markProjectRecentlyChanged(projectId);
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

  async function saveFocusSessionWithoutReview(input: { durationSeconds: number | null }) {
    if (!project || !focusSession) {
      return;
    }

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const focusTaskId = focusSession.taskId;
    const endedAtMs = focusSession.endedAtMs ?? Date.now();
    const workEntry = await api.createWorkEntry({
      projectId,
      taskId: focusTaskId,
      source: "focus",
      startedAt: new Date(focusSession.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationSeconds: input.durationSeconds,
      done: "Unreviewed focus session",
      remains: "",
      nextStep: ""
    });

    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    setSelectedWorkEntries((entries) => [...entries, workEntry]);
    setScreen("task-detail");
  }

  async function saveManualReview(input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
    noMeaningfulProgress: boolean;
  }) {
    if (!project) {
      return;
    }

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const taskId = manualReviewTaskId;
    await api.createWorkEntry({
      projectId,
      taskId,
      source: "manual",
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: input.noMeaningfulProgress && !input.done ? "No meaningful progress" : input.done,
      remains: input.remains,
      nextStep: input.nextStep
    });

    markProjectRecentlyChanged(projectId);
    if (!isCurrentProjectContext(revision)) {
      return;
    }
    if (!(await refreshProjectData(projectId, revision))) {
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

    const scrollToPreview = () => {
      const preview = document.getElementById("markdown-import-preview");
      if (!preview || typeof preview.scrollIntoView !== "function") {
        return;
      }

      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      preview.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start"
      });
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scrollToPreview);
    } else {
      window.setTimeout(scrollToPreview, 0);
    }
  }

  function updateMarkdownDraft(nextDraft: string) {
    setMarkdownDraft(nextDraft);
    setMarkdownFileName(null);
    setParsedPlan(null);
    setImportError(null);
  }

  function loadMarkdownFile(file: { name: string; text: string }) {
    setMarkdownDraft(file.text);
    setMarkdownFileName(file.name);
    setParsedPlan(null);
    setImportError(null);
  }

  function clearImportPreview() {
    setParsedPlan(null);
    setImportError(null);
  }

  function insertMarkdownExample() {
    updateMarkdownDraft(CANONICAL_MARKDOWN_TEMPLATE);
    showToast("success", "Example inserted", "The plan template is ready to edit.");
  }

  async function copyMarkdownTemplate() {
    await copyToClipboard(
      CANONICAL_MARKDOWN_TEMPLATE,
      "Template copied",
      "The plan structure template is in your clipboard."
    );
  }

  async function importMarkdownPlan() {
    if (!project || !parsedPlan || importing) {
      return;
    }

    if (!canImportParsedPlan(parsedPlan)) {
      return;
    }

    const projectId = project.id;
    const revision = projectContextRevision.current;
    const planTitle = parsedPlan.planTitle ?? nextPlanTitle(projectPlan);
    setImporting(true);
    setImportError(null);
    try {
      await api.importPlan(projectId, planTitle, parsedPlan.stages);
      markProjectRecentlyChanged(projectId);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      const loadedProjectSummaries = await loadProjectSummariesOrEmpty();
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setProjectSummaries(loadedProjectSummaries);
      if (!(await refreshProjectData(projectId, revision))) {
        return;
      }
      setMarkdownDraft("");
      setParsedPlan(null);
      setScreen("plan");
    } catch (error) {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setImportError("Could not import plan.");
    } finally {
      if (isCurrentProjectContext(revision)) {
        setImporting(false);
      }
    }
  }

  async function refreshProjectDiagnostics() {
    if (!project) {
      return;
    }

    const revision = projectContextRevision.current;
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const nextDiagnostics = await api.getProjectDiagnostics(project.id);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setDiagnostics(nextDiagnostics);
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setDiagnosticsError("Could not read local diagnostics.");
    } finally {
      if (isCurrentProjectContext(revision)) {
        setDiagnosticsLoading(false);
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
      const exported = await api.exportProjectBundle(project.id, destination);
      markProjectRecentlyChanged(project.id);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableStatus(
        exported.backupRecorded
          ? null
          : "Backup file was saved, but last-backup metadata could not be saved."
      );
      showToast(
        exported.backupRecorded ? "success" : "warning",
        "Backup saved",
        exported.backupRecorded
          ? "A portable .desclop backup and matching README were created."
          : "The .desclop backup and README were created, but its local backup record needs attention."
      );
      void refreshProjectDiagnostics();
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not export portable bundle.");
    }
  }

  async function reviewPortableRestore() {
    const revision = projectContextRevision.current;
    const source = bundleFolder.trim();
    const localPath = reselectedLocalPath.trim();
    if (!source || !localPath) {
      setPortableError("Backup file and local project folder are required.");
      setPortableStatus(null);
      return;
    }

    setPortableError(null);
    setPortableStatus(null);
    setRestorePreview(null);
    try {
      const preview = await api.inspectProjectBundle(source);
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setRestorePreview(preview);
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("This backup is not compatible or did not pass integrity checks.");
    }
  }

  async function importPortableBundle() {
    let revision = projectContextRevision.current;
    const source = bundleFolder.trim();
    const localPath = reselectedLocalPath.trim();
    if (!source || !localPath) {
      setPortableError("Backup file and local project folder are required.");
      setPortableStatus(null);
      return;
    }

    setPortableError(null);
    setPortableStatus(null);
    setRestorePreview(null);
    try {
      const importedProjectId = await api.importProjectBundle(source, localPath, true);
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
      showToast(
        "success",
        "Backup restored",
        "The restored project is open and appears first in the project picker."
      );
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
        setRestorePreview(null);
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

  async function chooseBundleFile() {
    const revision = projectContextRevision.current;
    try {
      const selected = await choosePortableBackupFile();
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      if (selected) {
        setBundleFolder(selected);
        setPortableError(null);
        setRestorePreview(null);
      }
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not open backup file picker.");
    }
  }

  async function chooseLegacyBundleFolder() {
    await choosePortableFolder(setBundleFolder);
  }

  async function chooseLocalProjectFolder() {
    await choosePortableFolder(setReselectedLocalPath);
  }

  async function chooseRelinkFolder() {
    await choosePortableFolder(setRelinkPath);
  }

  async function confirmRelinkProjectFolder() {
    if (!project || !relinkPath.trim()) {
      return;
    }

    const revision = projectContextRevision.current;
    setPortableError(null);
    try {
      const relinkedProject = await api.relinkProjectFolder(project.id, relinkPath.trim());
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setProjects((currentProjects) => [
        relinkedProject,
        ...currentProjects.filter((candidate) => candidate.id !== relinkedProject.id)
      ]);
      setRelinkPath("");
      setPortableStatus(null);
      showToast(
        "success",
        "Project folder reconnected",
        "Planning data was unchanged."
      );
      setGitError(null);
      void refreshProjectDiagnostics();
    } catch {
      if (!isCurrentProjectContext(revision)) {
        return;
      }
      setPortableError("Could not reconnect the local project folder.");
    }
  }

  async function copyToClipboard(
    value: string,
    successTitle: string,
    successMessage: string
  ) {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      showToast("success", successTitle, successMessage);
    } catch {
      showToast("error", "Could not copy", "Select the text and copy it manually instead.");
    }
  }

  async function copyMarkdown(markdown: string, planTitle: string) {
    await copyToClipboard(markdown, "Markdown copied", `Copied ${planTitle}.`);
  }

  async function copyContext(markdown: string) {
    await copyToClipboard(
      markdown,
      "Context copied",
      "The reviewed local context is in your clipboard."
    );
  }

  async function copySupportDiagnostics() {
    if (!diagnostics) {
      return;
    }
    await copyToClipboard(
      JSON.stringify(diagnostics.supportReport, null, 2),
      "Technical diagnostics copied",
      "The copy contains local technical state only, not project content."
    );
  }

  function leavePortableRestoreSetup() {
    setPortableError(null);
    setRestorePreview(null);
    setBundleFolder("");
    setReselectedLocalPath("");
    setSetupMode(projects.length ? "picker" : "create");
  }

  function renderPortableRestoreSetup() {
    return (
      <Surface ariaLabel="Restore a portable backup" className="start-flow">
        <ScreenHeader
          title="Restore a backup"
          description="Bring a saved Desclop project into this local library without creating a blank project first."
        />
        <InlineAlert tone="info">
          Restore creates a separate local project record. It does not overwrite existing projects or source files.
        </InlineAlert>
        <PortableRestoreForm
          idPrefix="setup"
          backupPath={bundleFolder}
          localProjectPath={reselectedLocalPath}
          preview={restorePreview}
          error={portableError}
          onChooseBackupFile={() => void chooseBundleFile()}
          onChooseLegacyBackupFolder={() => void chooseLegacyBundleFolder()}
          onChooseLocalProjectFolder={() => void chooseLocalProjectFolder()}
          onReview={() => void reviewPortableRestore()}
          onConfirm={() => void importPortableBundle()}
          onCancel={() => setRestorePreview(null)}
        />
      </Surface>
    );
  }

  function renderSettingsScreen() {
    return (
      <Settings
        settings={settings}
        error={settingsError}
        status={settingsStatus}
        onChange={changeSetting}
        onQuit={quitApplication}
      />
    );
  }

  function renderProjectScreen() {
    if (screen === "settings") {
      return renderSettingsScreen();
    }

    if (screen === "weekly-review" && project) {
      if (reviewLoading) {
        return (
          <Surface ariaLabel="Weekly Review loading">
            <ScreenHeader
              eyebrow="Review"
              title="Weekly Review"
              descriptionKind="status"
              description="Loading local review records."
            />
          </Surface>
        );
      }

      const review = buildWeeklyReview({
        project,
        tasks: projectPlan.tasks,
        inboxItems: reviewInboxItems,
        workEntries: reviewWorkEntries,
        notes: reviewNotes,
        commits: gitCommits,
        gitStatus: {
          enabled: project.gitEnabled,
          unavailable: Boolean(gitError),
          syncedAt: gitLastSyncedAt
        }
      });

      return (
        <>
          {reviewError ? <InlineAlert tone="error">{reviewError}</InlineAlert> : null}
          <WeeklyReview
            review={review}
            hasPlan={projectPlan.tasks.length > 0 || projectPlan.stages.length > 0}
            onOpenTask={(taskId) => void openTask(taskId)}
            onOpenTimeline={(target) => void openTimeline(target)}
            onOpenPlan={() => showProjectScreen("plan")}
            onOpenImport={() => showProjectScreen("import")}
            onOpenToday={() => showProjectScreen("today")}
            onStartManualWorkReview={startManualWorkReview}
          />
        </>
      );
    }

    if (screen === "import") {
      return (
        <section className="stack">
          <ScreenHeader
            eyebrow="Project"
            title="Import plan"
            description="Preview a Markdown task plan before writing it to the local project."
          />
          {importError ? <InlineAlert tone="error">{importError}</InlineAlert> : null}
          <FirstRunHint
            storageKey="desclop.first-run-help.plan-import.dismissed"
            title="Start with the supported plan shape"
            onOpenHelp={openHelp}
          >
            <p>Use a stage heading and checkbox task, then add checklist items with two spaces of indentation.</p>
            <p>The Plan structure panel below includes a ready-to-use example and a one-click insert action.</p>
          </FirstRunHint>
          <div className="markdown-import__layout">
            <Surface ariaLabel="Markdown import" className="markdown-import">
              <TextArea
                id="markdown-plan"
                label="Markdown plan"
                hint="Use the supported structure below. Preview must be run again after edits."
                value={markdownDraft}
                placeholder={`# Optional plan name\n\n## Stage name\n- [ ] Task title\n  - [ ] Checklist item`}
                disabled={importing}
                onChange={(event) => updateMarkdownDraft(event.target.value)}
              />
              <MarkdownFilePicker
                draft={markdownDraft}
                fileName={markdownFileName}
                disabled={importing}
                onChooseFile={chooseMarkdownFile}
                onReadFile={api.readMarkdownFile}
                onFileLoaded={loadMarkdownFile}
                onError={setImportError}
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

            <details
              className="ui-surface markdown-import__guide"
              aria-label="Plan structure"
            >
              <summary className="markdown-import__guide-summary">
                <span className="markdown-import__guide-summary-copy">
                  <h2>Plan structure</h2>
                  <p>Show the supported format and example.</p>
                </span>
                <span className="markdown-import__guide-toggle" aria-hidden="true">
                  <span className="markdown-import__guide-toggle-open">Show</span>
                  <span className="markdown-import__guide-toggle-close">Hide</span>
                </span>
              </summary>
              <div className="markdown-import__guide-content">
                <div className="markdown-import__guide-header">
                  <p>Descriptions are optional and stay attached to the stage, task, or checklist item above them.</p>
                  <div className="markdown-import__guide-actions">
                    <Button type="button" variant="secondary" onClick={insertMarkdownExample}>
                      Insert example
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void copyMarkdownTemplate()}>
                      Copy template
                    </Button>
                  </div>
                </div>
                <pre className="markdown-import__template">
                  <code>{CANONICAL_MARKDOWN_TEMPLATE}</code>
                </pre>
                <div className="markdown-import__description-example">
                  <p>Optional explanation example:</p>
                  <pre className="markdown-import__template markdown-import__template--compact">
                    <code>
                      {[
                        "## Stage",
                        "> Why this stage matters",
                        "- [ ] Task",
                        "  > What the task should achieve",
                        "  - [ ] Checklist item",
                        "    > How to verify this item"
                      ].join("\n")}
                    </code>
                  </pre>
                </div>
                <ul className="markdown-import__rules">
                  <li><code>##</code> is a stage; <code>###</code> is accepted for legacy plans.</li>
                  <li><code>- [ ]</code>/<code>- [x]</code> is a task; two spaces make a checklist item.</li>
                  <li><span className="markdown-import__rule-label">Stage:</span> <code>&gt; text</code> directly below its heading.</li>
                  <li><span className="markdown-import__rule-label">Task:</span> <code>  &gt; text</code> directly below the task.</li>
                  <li><span className="markdown-import__rule-label">Checklist:</span> <code>    &gt; text</code> directly below the checklist item.</li>
                  <li>Other Markdown is shown as a line warning and is not imported.</li>
                </ul>
              </div>
            </details>
          </div>
          <MarkdownImportPreview
            parsed={parsedPlan}
            fallbackPlanTitle={nextPlanTitle(projectPlan)}
            onImport={() => void importMarkdownPlan()}
            onCancel={clearImportPreview}
            importing={importing}
          />
        </section>
      );
    }

    if (screen === "plan") {
      return (
          <Planner
            planFrames={buildPlanFrames(
              projectPlan.plans,
              projectPlan.stages,
              projectPlan.tasks,
              projectPlan.checklistItems,
              project?.activeTaskId ?? null
            )}
            projectId={project?.id}
            archivedPlanIds={archivedPlanIds}
            onArchivePlan={archivePlan}
            onRestorePlan={restorePlan}
            onSavePlan={savePlanEditor}
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
          dateKey={timelineDateKey}
          focusItemKey={timelineFocusItemKey}
          onClearDateFilter={() => void openTimeline()}
        />
      );
    }

    if (screen === "utilities" && project) {
      return (
        <Utilities
          projectPath={project.localPath}
          gitEnabled={project.gitEnabled}
          gitHealth={gitError}
          markdownExports={markdownExports}
          bundleDestination={bundleDestination}
          bundleFolder={bundleFolder}
          reselectedLocalPath={reselectedLocalPath}
          portableStatus={portableStatus}
          portableError={portableError}
          restorePreview={restorePreview}
          diagnostics={diagnostics}
          diagnosticsLoading={diagnosticsLoading}
          diagnosticsError={diagnosticsError}
          relinkPath={relinkPath}
          contextExport={{
            project,
            plans: projectPlan.plans ?? [],
            stages: projectPlan.stages,
            tasks: projectPlan.tasks,
            checklistItems: projectPlan.checklistItems,
            workEntries: contextExportWorkEntries,
            notes: contextExportNotes,
            linkedCommits: contextExportLinkedCommits,
            selectedPlanId: contextExportPlanId,
            selectedTaskId: contextExportTaskId,
            loading: contextExportLoading,
            error: contextExportError,
            onPlanChange: handleContextExportPlanChange,
            onTaskChange: handleContextExportTaskChange,
            onRefresh: () => void prepareContextExport(),
            onCopy: (markdown: string) => void copyContext(markdown)
          }}
          onOpenImport={() => setScreen("import")}
          onChooseBundleDestination={() => void chooseBundleDestination()}
          onChooseBundleFile={() => void chooseBundleFile()}
          onChooseLegacyBundleFolder={() => void chooseLegacyBundleFolder()}
          onChooseLocalProjectFolder={() => void chooseLocalProjectFolder()}
          onChooseRelinkFolder={() => void chooseRelinkFolder()}
          onExportPortableBundle={() => void exportPortableBundle()}
          onReviewPortableRestore={() => void reviewPortableRestore()}
          onConfirmPortableRestore={() => void importPortableBundle()}
          onCancelPortableRestore={() => setRestorePreview(null)}
          onRefreshDiagnostics={() => void refreshProjectDiagnostics()}
          onCopySupportDiagnostics={() => void copySupportDiagnostics()}
          onCopyMarkdown={(markdown, planTitle) => void copyMarkdown(markdown, planTitle)}
          onConfirmRelink={() => void confirmRelinkProjectFolder()}
          onCancelRelink={() => setRelinkPath("")}
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
          stageDescription={selectedStage?.description}
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
          onStartManualWorkReview={() => startManualWorkReview(selectedTask.id)}
        />
      );
    }

    if (screen === "focus" && focusSession) {
      const focusTask =
        projectPlan.tasks.find((candidate) => candidate.id === focusSession.taskId) ?? null;
      if (focusTask) {
        const focusStage =
          projectPlan.stages.find((stage) => stage.id === focusTask.stageId) ?? null;
        return (
          <FocusMode
            task={focusTask}
            stageDescription={focusStage?.description}
            checklist={projectPlan.checklistItems.filter((item) => item.taskId === focusTask.id)}
            notes={selectedNotes}
            mode={focusSession.mode}
            startedAtMs={focusSession.startedAtMs}
            nowMs={focusSession.nowMs}
            timeboxMinutes={focusSession.timeboxMinutes}
            onFinish={finishFocus}
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
          onSkip={saveFocusSessionWithoutReview}
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

    const todayView = buildTodayView(resumeBrief, projectPlan, todayTask, gitCommits, gitCurrentBranch);

    return (
      <Today
        view={todayView}
        onPrimaryAction={() => handleTodayPrimaryAction(todayView)}
        onOpenTask={(taskId) => void openTask(taskId)}
        onStartManualWorkReview={() => startManualWorkReview(todayTask?.id ?? null)}
        canUsePrimaryAction={todayView.state !== "ready" || Boolean(todayTask)}
      />
    );
  }

  if (loading) {
    return (
      <AppShell activeDestination="setup">
        <Surface ariaLabel="Loading">
          <ScreenHeader
            title="Opening Desclop"
            descriptionKind="status"
            description="Loading local project context."
          />
        </Surface>
      </AppShell>
    );
  }

  if (databaseStatus?.state === "recovery_required") {
    return (
      <AppShell activeDestination="setup">
        <Surface ariaLabel="Database recovery required" className="start-flow">
          <ScreenHeader
            title="Database recovery required"
            descriptionKind="status"
            description="Desclop did not replace or initialize a blank database over your existing data."
          />
          <InlineAlert tone="error">
            {databaseStatus.nextStep ?? "Quit Desclop and recover from a known local SQLite snapshot."}
          </InlineAlert>
          <p className="ui-help-text">Recovery code: {databaseStatus.recoveryCode ?? "unknown"}</p>
          {databaseStatus.recoveryBackupPath ? (
            <p className="ui-help-text">
              Local recovery snapshot: <code>{databaseStatus.recoveryBackupPath}</code>
            </p>
          ) : null}
          <Button type="button" onClick={() => void loadProjects()}>
            Check database again
          </Button>
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
            descriptionKind="status"
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
    if (screen === "settings") {
      return (
        <AppShell
          activeDestination="settings"
          scrollScope="global"
          onNavigate={handleNavigate}
          onOpenHelp={openHelp}
          onBackToProjects={leaveSettingsToProjectSetup}
        >
          {renderSettingsScreen()}
        </AppShell>
      );
    }

    return (
      <AppShell
        activeDestination="setup"
        onNavigate={handleNavigate}
        onOpenHelp={openHelp}
        onBackToProjects={setupMode === "restore" ? leavePortableRestoreSetup : undefined}
      >
        {setupMode === "restore" ? (
          renderPortableRestoreSetup()
        ) : (
          <ProjectSetup
            creating={creating}
            error={createError}
            onChooseFolder={chooseFolder}
            onValidateFolder={api.inspectProjectFolder}
            onOpenHelp={openHelp}
            onCreate={createProject}
            onRestoreBackup={() => {
              setCreateError(null);
              setPortableError(null);
              setSetupMode("restore");
            }}
          />
        )}
        <FirstRunHelp open={helpOpen} onOpenChange={setHelpOpen} />
      </AppShell>
    );
  }

  if (!project) {
    if (screen === "settings") {
      return (
        <AppShell
          activeDestination="settings"
          scrollScope="global"
          onNavigate={handleNavigate}
          onOpenHelp={openHelp}
          onBackToProjects={leaveSettingsToProjectSetup}
        >
          {renderSettingsScreen()}
        </AppShell>
      );
    }

    return (
      <AppShell
        activeDestination="setup"
        scrollScope="project-picker"
        onNavigate={handleNavigate}
        onOpenHelp={openHelp}
        onBackToProjects={
          setupMode === "create" || setupMode === "restore"
            ? () => {
                if (setupMode === "restore") {
                  leavePortableRestoreSetup();
                } else {
                  setCreateError(null);
                  setSetupMode("picker");
                }
              }
            : undefined
        }
      >
        {setupMode === "restore" ? (
          renderPortableRestoreSetup()
        ) : setupMode === "create" ? (
          <ProjectSetup
            creating={creating}
            error={createError}
            onChooseFolder={chooseFolder}
            onValidateFolder={api.inspectProjectFolder}
            onOpenHelp={openHelp}
            onCreate={createProject}
            onRestoreBackup={() => {
              setCreateError(null);
              setPortableError(null);
              setSetupMode("restore");
            }}
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
              onRestoreBackup={() => {
                setPortableError(null);
                setSetupMode("restore");
              }}
            />
          </>
        )}
        <FirstRunHelp open={helpOpen} onOpenChange={setHelpOpen} />
      </AppShell>
    );
  }

  return (
    <AppShell
      activeDestination={activeDestinationForScreen(screen)}
      scrollScope={project?.id ?? "global"}
      onNavigate={handleNavigate}
      projectName={project?.name}
      projectStatus={resumeError}
      onQuickCapture={openQuickCapture}
      onOpenHelp={openHelp}
      onCloseProject={closeProject}
    >
      {resumeError ? (
        <InlineAlert tone="warning">
          {resumeError}
        </InlineAlert>
      ) : null}
      {toast || (gitError && !gitErrorDismissed) ? (
        <div className="ui-toast-stack" aria-label="Notifications">
          {toast ? (
            <Toast
              key={toast.id}
              title={toast.title}
              message={toast.message}
              tone={toast.tone}
              onClose={() => setToast(null)}
            />
          ) : null}
          {gitError && !gitErrorDismissed ? (
            <Toast
              title="Git unavailable"
              message="No repository was found in this folder. Desclop still works without Git."
              onClose={() => setGitErrorDismissed(true)}
            />
          ) : null}
        </div>
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
      <FirstRunHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        onOpenPlanImport={() => setScreen("import")}
      />
    </AppShell>
  );
}

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";
import { api } from "../shared/api/client";
import {
  chooseFolder,
  chooseMarkdownFile,
  choosePortableBackupFile
} from "../shared/api/folderDialog";
import type { ResumeBrief } from "../shared/domain/types";
import { SETTINGS_SCHEMA_VERSION, SETTINGS_STORAGE_KEY } from "../features/settings/settings";
import { LAST_PROJECT_STORAGE_KEY } from "../features/project-setup/projectSelection";

const tauriEventMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const unlisten = vi.fn();
  const listen = vi.fn((eventName: string, handler: () => void) => {
    const handlers = listeners.get(eventName) ?? new Set<() => void>();
    handlers.add(handler);
    listeners.set(eventName, handlers);

    return Promise.resolve(() => {
      unlisten(eventName);
      handlers.delete(handler);
    });
  });

  return { listen, listeners, unlisten };
});

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    listProjectSummaries: vi.fn(),
    inspectProjectFolder: vi.fn(),
    readMarkdownFile: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    relinkProjectFolder: vi.fn(),
    getDatabaseStatus: vi.fn(),
    getProjectDiagnostics: vi.fn(),
    getResumeBrief: vi.fn(),
    loadProjectPlan: vi.fn(),
    importPlan: vi.fn(),
    savePlanEditor: vi.fn(),
    updateTaskStatus: vi.fn(),
    setActiveTask: vi.fn(),
    updateChecklistItem: vi.fn(),
    addNote: vi.fn(),
    updateNextStep: vi.fn(),
    createWorkEntry: vi.fn(),
    captureInboxItem: vi.fn(),
    attachInboxItemToTask: vi.fn(),
    deleteInboxItem: vi.fn(),
    listInboxItemsForProject: vi.fn(),
    listInboxItemsForTask: vi.fn(),
    listNotesForProject: vi.fn(),
    listNotesForTask: vi.fn(),
    listWorkEntriesForProject: vi.fn(),
    listWorkEntriesForTask: vi.fn(),
    readGitCommits: vi.fn(),
    readCurrentGitBranch: vi.fn(),
    syncGitCommits: vi.fn(),
    listLinkedCommitsForTask: vi.fn(),
    moveCommitLink: vi.fn(),
    unlinkCommit: vi.fn(),
    exportProjectBundle: vi.fn(),
    inspectProjectBundle: vi.fn(),
    importProjectBundle: vi.fn(),
    setCloseBehavior: vi.fn(),
    setCaptureShortcut: vi.fn(),
    closeMainWindow: vi.fn(),
    quitApp: vi.fn()
  }
}));

vi.mock("../shared/api/folderDialog", () => ({
  chooseFolder: vi.fn(),
  chooseMarkdownFile: vi.fn(),
  choosePortableBackupFile: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriEventMock.listen
}));

const listProjects = vi.mocked(api.listProjects);
const listProjectSummaries = vi.mocked(api.listProjectSummaries);
const inspectProjectFolder = vi.mocked(api.inspectProjectFolder);
const readMarkdownFile = vi.mocked(api.readMarkdownFile);
const createProject = vi.mocked(api.createProject);
const deleteProject = vi.mocked(api.deleteProject);
const relinkProjectFolder = vi.mocked(api.relinkProjectFolder);
const getDatabaseStatus = vi.mocked(api.getDatabaseStatus);
const getProjectDiagnostics = vi.mocked(api.getProjectDiagnostics);
const getResumeBrief = vi.mocked(api.getResumeBrief);
const loadProjectPlan = vi.mocked(api.loadProjectPlan);
const importPlan = vi.mocked(api.importPlan);
const savePlanEditor = vi.mocked(api.savePlanEditor);
const createWorkEntry = vi.mocked(api.createWorkEntry);
const captureInboxItem = vi.mocked(api.captureInboxItem);
const attachInboxItemToTask = vi.mocked(api.attachInboxItemToTask);
const deleteInboxItem = vi.mocked(api.deleteInboxItem);
const listInboxItemsForProject = vi.mocked(api.listInboxItemsForProject);
const listInboxItemsForTask = vi.mocked(api.listInboxItemsForTask);
const updateChecklistItem = vi.mocked(api.updateChecklistItem);
const updateNextStep = vi.mocked(api.updateNextStep);
const setActiveTask = vi.mocked(api.setActiveTask);
const addNote = vi.mocked(api.addNote);
const quitApp = vi.mocked(api.quitApp);
const listNotesForProject = vi.mocked(api.listNotesForProject);
const listNotesForTask = vi.mocked(api.listNotesForTask);
const listWorkEntriesForProject = vi.mocked(api.listWorkEntriesForProject);
const listWorkEntriesForTask = vi.mocked(api.listWorkEntriesForTask);
const readCurrentGitBranch = vi.mocked(api.readCurrentGitBranch);
const syncGitCommits = vi.mocked(api.syncGitCommits);
const listLinkedCommitsForTask = vi.mocked(api.listLinkedCommitsForTask);
const moveCommitLink = vi.mocked(api.moveCommitLink);
const unlinkCommit = vi.mocked(api.unlinkCommit);
const exportProjectBundle = vi.mocked(api.exportProjectBundle);
const inspectProjectBundle = vi.mocked(api.inspectProjectBundle);
const importProjectBundle = vi.mocked(api.importProjectBundle);
const chooseFolderMock = vi.mocked(chooseFolder);
const chooseMarkdownFileMock = vi.mocked(chooseMarkdownFile);
const choosePortableBackupFileMock = vi.mocked(choosePortableBackupFile);
const FIRST_RUN_HELP_STORAGE_KEY = "desclop.first-run-help.dismissed";
const onboardingStorage = new Map<string, string>();

const onboardingStorageMock = {
  getItem: (key: string) => onboardingStorage.get(key) ?? null,
  setItem: (key: string, value: string) => onboardingStorage.set(key, value),
  removeItem: (key: string) => onboardingStorage.delete(key)
};

function enableTauriApi() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true
  });
}

function emitTauriEvent(eventName: string) {
  for (const handler of tauriEventMock.listeners.get(eventName) ?? []) {
    handler();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function projectFixture(overrides: Partial<Awaited<ReturnType<typeof api.listProjects>>[number]> = {}) {
  return {
    id: "p1",
    name: "Desclop",
    localPath: "/tmp/desclop",
    gitEnabled: false,
    gitRemote: null,
    activeTaskId: null,
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
    ...overrides
  };
}

function emptyResumeBrief(projectId = "p1"): ResumeBrief {
  return {
    id: "rb1",
    projectId,
    taskId: null,
    stageId: null,
    latestNote: "",
    nextStep: "",
    facts: [],
    generatedAt: "2026-05-20T10:00:00Z"
  };
}

function portableExportResult(path: string) {
  return {
    path,
    exportedAt: "2026-07-25T10:00:00Z",
    formatVersion: 2,
    backupRecorded: true
  };
}

function portableBundlePreview() {
  return {
    formatVersion: 2,
    compatibility: "current" as const,
    projectName: "Imported Project",
    planCount: 1,
    stageCount: 1,
    taskCount: 1,
    checklistItemCount: 1,
    noteCount: 1,
    workEntryCount: 1
  };
}

function resumeBriefFixture(overrides: Partial<ReturnType<typeof emptyResumeBrief>> = {}) {
  return {
    ...emptyResumeBrief(overrides.projectId ?? "p1"),
    ...overrides
  };
}

function importedPlanFixture(projectId: string) {
  return {
    plans: [
      {
        id: "plan-1",
        projectId,
        title: "Build MVP",
        position: 0
      }
    ],
    stages: [
      {
        id: "s1",
        projectId,
        planId: "plan-1",
        title: "Foundation",
        description: "",
        position: 0,
        status: "current" as const
      }
    ],
    tasks: [
      {
        id: "t1",
        projectId,
        stageId: "s1",
        title: "Create local store",
        description: "",
        status: "todo" as const,
        priority: null,
        dueDate: null,
        nextStep: "",
        position: 0
      }
    ],
    checklistItems: [
      {
        id: "c1",
        taskId: "t1",
        title: "Add migration",
        completed: true,
        position: 0
      }
    ]
  };
}

function activeProjectPlanFixture({
  projectId,
  stageTitle,
  taskTitle,
  nextStep
}: {
  projectId: string;
  stageTitle: string;
  taskTitle: string;
  nextStep: string;
}) {
  return {
    plans: [
      {
        id: `${projectId}-plan`,
        projectId,
        title: "Build MVP",
        position: 0
      }
    ],
    stages: [
      {
        id: `${projectId}-stage`,
        projectId,
        planId: `${projectId}-plan`,
        title: stageTitle,
        description: "",
        position: 0,
        status: "current" as const
      }
    ],
    tasks: [
      {
        id: `${projectId}-task`,
        projectId,
        stageId: `${projectId}-stage`,
        title: taskTitle,
        description: "",
        status: "active" as const,
        priority: null,
        dueDate: null,
        nextStep,
        position: 0
      }
    ],
    checklistItems: []
  };
}

function twoTaskPlanFixture({
  firstStatus,
  secondStatus
}: {
  firstStatus: "todo" | "active" | "done";
  secondStatus: "todo" | "active" | "done";
}) {
  return {
    plans: [
      {
        id: "plan-1",
        projectId: "p1",
        title: "Build MVP",
        position: 0
      }
    ],
    stages: [
      {
        id: "s1",
        projectId: "p1",
        planId: "plan-1",
        title: "Foundation",
        description: "",
        position: 0,
        status: "current" as const
      }
    ],
    tasks: [
      {
        id: "t1",
        projectId: "p1",
        stageId: "s1",
        title: "First task",
        description: "",
        status: firstStatus,
        priority: null,
        dueDate: null,
        nextStep: "",
        position: 0
      },
      {
        id: "t2",
        projectId: "p1",
        stageId: "s1",
        title: "Second task",
        description: "",
        status: secondStatus,
        priority: null,
        dueDate: null,
        nextStep: "",
        position: 1
      }
    ],
    checklistItems: []
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: onboardingStorageMock
  });
  onboardingStorage.clear();
  window.localStorage.removeItem(FIRST_RUN_HELP_STORAGE_KEY);
  listProjectSummaries.mockResolvedValue([]);
  getDatabaseStatus.mockResolvedValue({
    state: "ready",
    schemaVersion: 3,
    targetSchemaVersion: 3,
    integrity: "ok",
    recoveryCode: null,
    recoveryBackupPath: null,
    nextStep: null
  });
  getProjectDiagnostics.mockResolvedValue({
    appVersion: "0.2.0-beta.1",
    projectPath: "/tmp/desclop",
    folderState: "available",
    git: { configured: false, repositoryDetected: false },
    database: { state: "ready", schemaVersion: 3, targetSchemaVersion: 3, integrity: "ok" },
    lastBackup: { state: "none", kind: null, createdAt: null, formatVersion: null, schemaVersion: null },
    relinkAvailable: true,
    supportReport: {
      diagnosticFormatVersion: 1,
      appVersion: "0.2.0-beta.1",
      folderState: "available",
      git: { configured: false, repositoryDetected: false },
      database: { state: "ready", schemaVersion: 3, targetSchemaVersion: 3, integrity: "ok" },
      lastBackup: { state: "none", kind: null, createdAt: null, formatVersion: null, schemaVersion: null },
      relinkAvailable: true
    }
  });
  inspectProjectBundle.mockResolvedValue(portableBundlePreview());
  inspectProjectFolder.mockResolvedValue({ gitRepository: false });
  readMarkdownFile.mockResolvedValue({ fileName: "plan.md", text: "" });
  readCurrentGitBranch.mockResolvedValue(null);
});

afterEach(() => {
  onboardingStorage.clear();
  window.localStorage.removeItem(FIRST_RUN_HELP_STORAGE_KEY);
  vi.useRealTimers();
  tauriEventMock.listeners.clear();
  chooseFolderMock.mockReset();
  chooseMarkdownFileMock.mockReset();
  choosePortableBackupFileMock.mockReset();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("App", () => {
  it("mounts first-run help after loading reaches project setup", async () => {
    renderWithRouter(<App />);

    expect(await screen.findByRole("dialog", { name: "First-run help" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create a local project" })).toBeInTheDocument();
  });

  it("renders the desktop shell", () => {
    renderWithRouter(<App />);
    expect(screen.getByText("Desclop")).toBeInTheDocument();
  });

  it("locks document scrolling so only the app content pane scrolls", () => {
    renderWithRouter(<App />);

    const htmlStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);
    const shellStyles = getComputedStyle(document.querySelector(".app-shell") as HTMLElement);
    const contentStyles = getComputedStyle(document.querySelector(".app-content") as HTMLElement);

    expect(htmlStyles.height).toBe("100%");
    expect(bodyStyles.height).toBe("100%");
    expect(bodyStyles.overflow).toBe("hidden");
    expect(shellStyles.height).toBe("100%");
    expect(shellStyles.overflow).toBe("hidden");
    expect(contentStyles.overflowY).toBe("auto");
  });

  it("renders a calm loading state inside the shell", async () => {
    enableTauriApi();
    getDatabaseStatus.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", { name: "Opening Desclop" })
    ).toBeInTheDocument();
    expect(screen.getByText("Loading local project context.")).toBeInTheDocument();
  });

  it("shows a recoverable error when project loading fails", async () => {
    enableTauriApi();
    listProjects.mockRejectedValue(new Error("database unavailable"));

    renderWithRouter(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load projects.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create project" })).not.toBeInTheDocument();
  });

  it("stops normal data loading and shows the local recovery route for a protected database", async () => {
    enableTauriApi();
    getDatabaseStatus.mockResolvedValue({
      state: "recovery_required",
      schemaVersion: 1,
      targetSchemaVersion: 3,
      integrity: "recovery_required",
      recoveryCode: "migration_failed",
      recoveryBackupPath: "/tmp/desclop-backups/migration-v1.sqlite3",
      nextStep: "Restore the local SQLite snapshot before reopening."
    });

    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", { name: "Database recovery required" })
    ).toBeInTheDocument();
    expect(screen.getByText("Restore the local SQLite snapshot before reopening.")).toBeInTheDocument();
    expect(screen.getByText("/tmp/desclop-backups/migration-v1.sqlite3")).toBeInTheDocument();
    expect(listProjects).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Create project" })).not.toBeInTheDocument();
  });

  it("opens projects when project summaries are unavailable", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "p1-task" })]);
    listProjectSummaries.mockRejectedValueOnce(new Error("summary unavailable"));
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(
      activeProjectPlanFixture({
        projectId: "p1",
        stageTitle: "Summary fallback",
        taskTitle: "Open despite summary failure",
        nextStep: "Keep project loading resilient"
      })
    );

    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", { name: "Open despite summary failure" })
    ).toBeInTheDocument();
    expect(listProjectSummaries).toHaveBeenCalledTimes(1);
  });

  it("passes loaded project summaries to the saved-project picker", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ name: "Metadata Project" })]);
    listProjectSummaries.mockResolvedValue([
      {
        projectId: "p1",
        taskCount: 12,
        openInboxCount: 3,
        activeTaskTitle: "Create local store"
      }
    ]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));

    expect(
      screen.getByRole("button", {
        name: /Metadata Project.*12 tasks.*3 inbox items.*Active: Create local store.*Open project/s
      })
    ).toBeInTheDocument();
  });

  it("shows a recoverable error when project plan loading fails", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: null,
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: null,
      stageId: null,
      latestNote: "",
      nextStep: "Choose the next concrete step before you stop.",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockRejectedValue(new Error("plan unavailable"));

    renderWithRouter(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load project plan.");
  });

  it("shows the resumed task and stage from the loaded plan", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "Migration passes",
      nextStep: "Run repository tests",
      facts: ["1 recent commit captured on main"],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: []
    });

    renderWithRouter(<App />);

    expect(await screen.findByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(screen.getByText("Migration passes")).toBeInTheDocument();
    expect(screen.getByText("1 recent commit captured on main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue task" })).toBeEnabled();
    expect(screen.queryByText("Active task")).not.toBeInTheDocument();
  });

  it("does not keep a completed stale resume or active task on Today", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ taskId: "t1", stageId: "s1" }));
    const plan = importedPlanFixture("p1");
    loadProjectPlan.mockResolvedValue({
      ...plan,
      tasks: [{ ...plan.tasks[0], title: "Completed stale task", status: "done" }]
    });

    renderWithRouter(<App />);

    const currentTask = await screen.findByLabelText("Current task");
    expect(within(currentTask).getByRole("heading", { name: "No active task" })).toBeInTheDocument();
    expect(within(currentTask).queryByText("Completed stale task")).not.toBeInTheDocument();
  });

  it("uses a non-done project active task when the resume task is done", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t2" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({
        taskId: "t1",
        stageId: "s1",
        latestNote: "Stale completed-task note",
        facts: ["Stale completed-task fact"]
      })
    );
    const plan = twoTaskPlanFixture({ firstStatus: "done", secondStatus: "active" });
    loadProjectPlan.mockResolvedValue({
      ...plan,
      stages: [
        ...plan.stages,
        {
          ...plan.stages[0],
          id: "s2",
          title: "Active task stage",
          position: 1
        }
      ],
      tasks: plan.tasks.map((task) => ({
        ...task,
        stageId: task.id === "t2" ? "s2" : task.stageId,
        title: task.id === "t1" ? "Completed resume task" : "Valid active task",
        nextStep: task.id === "t2" ? "Continue valid work" : ""
      }))
    });

    renderWithRouter(<App />);

    const currentTask = await screen.findByLabelText("Current task");
    expect(within(currentTask).getByRole("heading", { name: "Valid active task" })).toBeInTheDocument();
    expect(within(currentTask).getByText("Active task stage")).toBeInTheDocument();
    expect(within(currentTask).queryByText("Completed resume task")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale completed-task note")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale completed-task fact")).not.toBeInTheDocument();
  });

  it("uses the selected task stage when the matching resume stage is stale", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ taskId: "t1", stageId: "stale-stage" }));
    const plan = importedPlanFixture("p1");
    loadProjectPlan.mockResolvedValue({
      ...plan,
      stages: [
        ...plan.stages,
        {
          ...plan.stages[0],
          id: "stale-stage",
          title: "Stale resume stage",
          position: 1,
          status: "future"
        }
      ],
      tasks: [{ ...plan.tasks[0], nextStep: "Continue current work" }]
    });

    renderWithRouter(<App />);

    const currentTask = await screen.findByLabelText("Current task");
    expect(within(currentTask).getByText("Foundation")).toBeInTheDocument();
    expect(within(currentTask).queryByText("Stale resume stage")).not.toBeInTheDocument();
  });

  it("orders Up next by stage and task position while excluding current and done tasks", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "current" })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ taskId: "current", stageId: "stage-b" }));
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "stage-b",
          projectId: "p1",
          title: "Second stage",
          description: "",
          position: 1,
          status: "current"
        },
        {
          id: "stage-a",
          projectId: "p1",
          title: "First stage",
          description: "",
          position: 0,
          status: "future"
        }
      ],
      tasks: [
        {
          id: "stage-b-later",
          projectId: "p1",
          stageId: "stage-b",
          title: "Second stage later",
          description: "",
          status: "todo",
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 2
        },
        {
          id: "done",
          projectId: "p1",
          stageId: "stage-a",
          title: "Completed task",
          description: "",
          status: "done",
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 0
        },
        {
          id: "stage-a-later",
          projectId: "p1",
          stageId: "stage-a",
          title: "First stage later",
          description: "",
          status: "todo",
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 2
        },
        {
          id: "current",
          projectId: "p1",
          stageId: "stage-b",
          title: "Current task",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Continue current work",
          position: 0
        },
        {
          id: "stage-a-first",
          projectId: "p1",
          stageId: "stage-a",
          title: "First stage first",
          description: "",
          status: "todo",
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 1
        }
      ],
      checklistItems: []
    });

    renderWithRouter(<App />);

    const nextUp = await screen.findByLabelText("Up next");
    expect(within(nextUp).getAllByRole("strong").map((item) => item.textContent)).toEqual([
      "First stage first",
      "First stage later",
      "Second stage later"
    ]);
    expect(within(nextUp).queryByText("Current task")).not.toBeInTheDocument();
    expect(within(nextUp).queryByText("Completed task")).not.toBeInTheDocument();
  });

  it("opens a nearby Today task in Task Detail", async () => {
    const user = userEvent.setup();
    const plan = twoTaskPlanFixture({ firstStatus: "active", secondStatus: "todo" });
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Continue first task" })
    );
    loadProjectPlan.mockResolvedValue(plan);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Second task" }));

    expect(await screen.findByRole("heading", { name: "Second task" })).toBeInTheDocument();
  });

  it("shows saved projects after closing and can reopen the same project", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task"
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({
        projectId: "p1",
        taskId: "p1-task",
        stageId: "p1-stage",
        latestNote: "First project resume",
        nextStep: "Continue first project"
      })
    );
    loadProjectPlan.mockResolvedValue(
      activeProjectPlanFixture({
        projectId: "p1",
        stageTitle: "First stage",
        taskTitle: "First project task",
        nextStep: "Continue first project"
      })
    );

    renderWithRouter(<App />);

    expect(await screen.findByRole("heading", { name: "First project task" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:switch|close) project$/i }));

    const firstProjectButton = await screen.findByRole("button", {
      name: /First Project.*Open project/s
    });
    expect(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    ).toBeInTheDocument();

    await user.click(firstProjectButton);

    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenLastCalledWith("p1");
    });
    expect(await screen.findByRole("heading", { name: "First project task" })).toBeInTheDocument();
  });

  it("opens another saved project with its own plan, resume, and Git context", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task",
      gitEnabled: true
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task",
      gitEnabled: true
    });
    const plans = {
      p1: activeProjectPlanFixture({
        projectId: "p1",
        stageTitle: "First stage",
        taskTitle: "First project task",
        nextStep: "Continue first project"
      }),
      p2: activeProjectPlanFixture({
        projectId: "p2",
        stageTitle: "Second stage",
        taskTitle: "Second project task",
        nextStep: "Continue second project"
      })
    };
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockImplementation(async (projectId) =>
      resumeBriefFixture({
        id: `${projectId}-resume`,
        projectId,
        taskId: `${projectId}-task`,
        stageId: `${projectId}-stage`,
        latestNote: projectId === "p1" ? "First project resume" : "Second project resume",
        nextStep: projectId === "p1" ? "Continue first project" : "Continue second project",
        facts: []
      })
    );
    loadProjectPlan.mockImplementation(async (projectId) => plans[projectId as keyof typeof plans]);
    syncGitCommits.mockImplementation(async (projectId) => [
      {
        sha: projectId === "p1" ? "first123" : "second456",
        projectId,
        branch: "main",
        message: projectId === "p1" ? "First project commit" : "Second project commit",
        authorName: "Clyde",
        committedAt: "2026-05-20T11:00:00Z",
        changedFiles: [projectId === "p1" ? "first.ts" : "second.ts"]
      }
    ]);

    renderWithRouter(<App />);

    expect(await screen.findByRole("heading", { name: "First project task" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:switch|close) project$/i }));
    await user.click(
      await screen.findByRole("button", { name: /Second Project.*Open project/s })
    );

    expect(await screen.findByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    expect(screen.getByText("Second stage")).toBeInTheDocument();
    expect(screen.getByText("Second project resume")).toBeInTheDocument();
    expect(screen.queryByText("First project task")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getResumeBrief).toHaveBeenLastCalledWith("p2");
      expect(loadProjectPlan).toHaveBeenLastCalledWith("p2");
      expect(syncGitCommits).toHaveBeenLastCalledWith("p2");
    });

    await user.click(screen.getByRole("button", { name: "Timeline" }));

    expect(await screen.findByText("Second project commit")).toBeInTheDocument();
    expect(screen.queryByText("First project commit")).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting a saved project", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));

    expect(deleteProject).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("p1");
    });
  });

  it("cancels project deletion without calling the API", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Delete project" })).not.toBeInTheDocument();
  });

  it("removes a deleted project from the saved-project list after opening the fallback", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    deleteProject.mockResolvedValue(undefined);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Application" })).toHaveTextContent(
        "Second Project"
      );
    });
    await user.click(screen.getByRole("button", { name: "Switch project" }));

    expect(
      screen.queryByRole("button", { name: /First Project.*Open project/s })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    ).toBeInTheDocument();
  });

  it("clears deleted project context and opens the fallback with its own context", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task",
      gitEnabled: true
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task",
      gitEnabled: true
    });
    const plans = {
      p1: activeProjectPlanFixture({
        projectId: "p1",
        stageTitle: "First stage",
        taskTitle: "First project task",
        nextStep: "Continue first project"
      }),
      p2: activeProjectPlanFixture({
        projectId: "p2",
        stageTitle: "Second stage",
        taskTitle: "Second project task",
        nextStep: "Continue second project"
      })
    };
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    deleteProject.mockResolvedValue(undefined);
    getResumeBrief.mockImplementation(async (projectId) =>
      resumeBriefFixture({
        id: `${projectId}-resume`,
        projectId,
        taskId: `${projectId}-task`,
        stageId: `${projectId}-stage`,
        latestNote: projectId === "p1" ? "First project resume" : "Second project resume",
        nextStep: projectId === "p1" ? "Continue first project" : "Continue second project"
      })
    );
    loadProjectPlan.mockImplementation(async (projectId) => plans[projectId as keyof typeof plans]);
    syncGitCommits.mockImplementation(async (projectId) => [
      {
        sha: projectId === "p1" ? "first123" : "second456",
        projectId,
        branch: "main",
        message: projectId === "p1" ? "First project commit" : "Second project commit",
        authorName: "Clyde",
        committedAt: "2026-05-20T11:00:00Z",
        changedFiles: [projectId === "p1" ? "first.ts" : "second.ts"]
      }
    ]);

    renderWithRouter(<App />);

    expect(await screen.findByRole("heading", { name: "First project task" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(await screen.findByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    expect(screen.getByText("Second stage")).toBeInTheDocument();
    expect(screen.getByText("Second project resume")).toBeInTheDocument();
    expect(screen.queryByText("First project task")).not.toBeInTheDocument();
    expect(screen.queryByText("First project resume")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Timeline" }));

    expect(await screen.findByText("Second project commit")).toBeInTheDocument();
    expect(screen.queryByText("First project commit")).not.toBeInTheDocument();
  });

  it("shows project creation after deleting the last saved project", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject]);
    deleteProject.mockResolvedValue(undefined);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(
      await screen.findByRole("heading", { name: "Create a local project" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveFocus();
  });

  it("keeps a project visible and shows its deletion error when deletion fails", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject]);
    deleteProject.mockRejectedValue(new Error("database unavailable"));
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete project.");
    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /First Project.*Open project/s })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete project" })).toBeEnabled();
  });

  it("keeps the picker visible when fallback project loading fails after deletion", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    deleteProject.mockResolvedValue(undefined);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan
      .mockResolvedValueOnce({ stages: [], tasks: [], checklistItems: [] })
      .mockRejectedValueOnce(new Error("plan unavailable"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(
      await screen.findByRole("button", { name: /Second Project.*Open project/s })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project loading failed" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load project plan.");
    expect(
      screen.queryByRole("button", { name: /First Project.*Open project/s })
    ).not.toBeInTheDocument();
  });

  it("clears a stale delete error when the same confirmation is reopened", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject]);
    deleteProject.mockRejectedValueOnce(new Error("database unavailable"));
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete project.");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(deleteProject).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate project deletion requests while deletion is pending", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject]);
    deleteProject.mockReturnValue(new Promise(() => undefined));
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Delete First Project" }));
    const confirmButton = screen.getByRole("button", { name: "Delete project" });

    act(() => {
      confirmButton.click();
      confirmButton.click();
    });

    expect(deleteProject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Delete project" })).toBeDisabled();
  });

  it("opens the existing project creation form from the saved-project list", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ name: "Existing Project" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: /^(?:switch|close) project$/i }));
    expect(
      screen.getByRole("button", { name: /Existing Project.*Open project/s })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create.*project/i }));

    expect(screen.getByRole("heading", { name: "Create a local project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeEnabled();
    expect(screen.getByLabelText("Local folder path")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Back to projects" }));

    expect(
      screen.getByRole("button", { name: /Existing Project.*Open project/s })
    ).toBeInTheDocument();
  });

  it("creates a project from the picker without losing saved projects", async () => {
    const user = userEvent.setup();
    const existingProject = projectFixture({ id: "p1", name: "Existing Project" });
    const createdProject = projectFixture({
      id: "p2",
      name: "Created Project",
      localPath: "/tmp/created-project",
      activeTaskId: "p2-task"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([existingProject]);
    createProject.mockResolvedValue(createdProject);
    getResumeBrief.mockImplementation(async (projectId) =>
      projectId === "p2"
        ? resumeBriefFixture({
            id: "p2-resume",
            projectId: "p2",
            taskId: "p2-task",
            stageId: "p2-stage",
            latestNote: "Created project resume",
            nextStep: "Continue created project"
          })
        : emptyResumeBrief(projectId)
    );
    loadProjectPlan.mockImplementation(async (projectId) =>
      projectId === "p2"
        ? activeProjectPlanFixture({
            projectId: "p2",
            stageTitle: "Created stage",
            taskTitle: "Created project task",
            nextStep: "Continue created project"
          })
        : { stages: [], tasks: [], checklistItems: [] }
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Create new project" }));
    await user.type(screen.getByLabelText("Project name"), "Created Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/created-project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProject).toHaveBeenCalledWith({
      name: "Created Project",
      localPath: "/tmp/created-project",
      gitEnabled: false
    });
    expect(
      await screen.findByRole("heading", { name: "Created project task" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    expect(
      screen.getByRole("button", { name: /Existing Project.*Open project/s })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Created Project.*Open project/s })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Existing Project.*Open project/s })
    );
    expect(
      within(screen.getByRole("complementary", { name: "Application" })).getByText(
        "Existing Project"
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Created Project.*Open project/s })
    );
    expect(
      await screen.findByRole("heading", { name: "Created project task" })
    ).toBeInTheDocument();
  });

  it("ignores pending Timeline data after closing its project", async () => {
    const user = userEvent.setup();
    let resolveFirstProjectNotes: (notes: Awaited<ReturnType<typeof api.listNotesForProject>>) => void =
      () => {};
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });
    listNotesForProject
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstProjectNotes = resolve;
        })
      )
      .mockResolvedValue([]);
    listWorkEntriesForProject.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Timeline" }));
    await waitFor(() => {
      expect(listNotesForProject).toHaveBeenCalledWith("p1");
    });
    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    );

    expect(
      within(screen.getByRole("complementary", { name: "Application" })).getByText(
        "Second Project"
      )
    ).toBeInTheDocument();

    await act(async () => {
      resolveFirstProjectNotes([
        {
          id: "p1-note",
          projectId: "p1",
          taskId: null,
          body: "First project stale timeline note",
          createdAt: "2026-05-20T12:00:00Z"
        }
      ]);
    });

    expect(
      within(screen.getByRole("complementary", { name: "Application" })).getByText(
        "Second Project"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("First project stale timeline note")).not.toBeInTheDocument();
  });

  it("shows project creation directly when there are no saved projects", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([]);

    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", { name: "Create a local project" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeEnabled();
    expect(screen.getByLabelText("Local folder path")).toBeEnabled();
  });

  it("reopens first-run help from the shell and does not block a later launch", async () => {
    const user = userEvent.setup();
    const existingProject = projectFixture();
    enableTauriApi();
    listProjects.mockResolvedValue([existingProject]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ plans: [], stages: [], tasks: [], checklistItems: [] });

    const view = renderWithRouter(<App />);
    const initialDialog = await screen.findByRole("dialog", { name: "First-run help" });
    await user.click(within(initialDialog).getByRole("button", { name: "Got it" }));

    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Help & plan example" }));
    const reopenedHelp = screen.getByRole("dialog", { name: "First-run help" });
    expect(reopenedHelp).toBeInTheDocument();

    await user.click(within(reopenedHelp).getByRole("button", { name: "Open Import Plan" }));
    expect(screen.getByRole("heading", { name: "Import plan" })).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole("button", {
        name: "Help & plan example"
      })
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();

    view.unmount();
    renderWithRouter(<App />);

    expect(await screen.findByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
  });

  it("keeps setup usable when first-run help was already dismissed", async () => {
    onboardingStorage.set(FIRST_RUN_HELP_STORAGE_KEY, "dismissed");
    enableTauriApi();
    listProjects.mockResolvedValue([]);

    renderWithRouter(<App />);

    expect(screen.queryByRole("dialog", { name: "First-run help" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Project name")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });

  it("imports a markdown plan and opens Plan with refreshed stages", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan
      .mockResolvedValueOnce({ stages: [], tasks: [], checklistItems: [] })
      .mockResolvedValueOnce(importedPlanFixture("p1"));
    importPlan.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import Plan" }));
    fireEvent.change(screen.getByLabelText("Markdown plan"), {
      target: { value: "# Build MVP\n## Foundation\n- [ ] Create local store\n  - [x] Add migration" }
    });
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await user.click(screen.getByRole("button", { name: "Import 1 task" }));

    expect(importPlan).toHaveBeenCalledWith("p1", "Build MVP", [
      {
        title: "Foundation",
        description: "",
        position: 0,
        tasks: [
          {
          title: "Create local store",
          description: "",
          status: "todo",
            position: 0,
            checklist: [
              { title: "Add migration", description: "", completed: true, position: 0 }
            ]
          }
        ]
      }
    ]);
    expect(await screen.findByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue Create local store" })).toBeEnabled();
  });

  it("shows the import template, placeholder, insert action, and clipboard copy", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ plans: [], stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import Plan" }));

    expect(screen.getByPlaceholderText(/Optional plan name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Markdown file" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Markdown file drop zone" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Start with the supported plan shape" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Import preview" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();
    const planGuide = screen.getByRole("heading", { name: "Plan structure" }).closest("details");
    expect(planGuide).not.toHaveAttribute("open");

    const fileText = "# File plan\n## Foundation\n- [ ] Read file";
    chooseMarkdownFileMock.mockResolvedValue("/tmp/plan.md");
    readMarkdownFile.mockResolvedValue({ fileName: "plan.md", text: fileText });
    await user.click(screen.getByRole("button", { name: "Choose Markdown file" }));
    await waitFor(() => expect(screen.getByLabelText("Markdown plan")).toHaveValue(fileText));
    expect(screen.getByText("Selected file: plan.md")).toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Plan structure" }));
    expect(planGuide).toHaveAttribute("open");
    expect(screen.getByText(/Why this stage matters/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Insert example" }));
    expect((screen.getByLabelText("Markdown plan") as HTMLTextAreaElement).value).toContain(
      "## Этап 1 — Основа"
    );
    expect(screen.getByRole("status")).toHaveClass("ui-toast", "ui-toast--success");
    expect(screen.getByRole("status")).toHaveTextContent("Example inserted");
    expect(screen.getByRole("status")).toHaveTextContent("The plan template is ready to edit.");

    await user.click(screen.getByRole("button", { name: "Copy template" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Template copied");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The plan structure template is in your clipboard."
    );

    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    );
    await user.click(screen.getByRole("button", { name: "Cancel preview" }));
    expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();

    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("uses the same preview for a selected file and pasted Markdown without importing", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ plans: [], stages: [], tasks: [], checklistItems: [] });

    const markdown = "# Shared plan\n## Foundation\n- [ ] Read file\n  - [ ] Keep local";
    chooseMarkdownFileMock.mockResolvedValue("/tmp/shared-plan.md");
    readMarkdownFile.mockResolvedValue({ fileName: "shared-plan.md", text: markdown });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import Plan" }));
    await user.click(screen.getByRole("button", { name: "Choose Markdown file" }));
    await waitFor(() => expect(screen.getByLabelText("Markdown plan")).toHaveValue(markdown));
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByText("Read file")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Import preview" })).getByText(/Keep local/)).toBeInTheDocument();
    expect(importPlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel preview" }));
    fireEvent.change(screen.getByLabelText("Markdown plan"), { target: { value: markdown } });
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByText("Read file")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Import preview" })).getByText(/Keep local/)).toBeInTheDocument();
    expect(importPlan).not.toHaveBeenCalled();
  });

  it("navigates to Timeline and Utilities from the shell", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: false })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ facts: ["1 recent commit captured on main"] })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Timeline" }));
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("0 commits · No work reviews · No notes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Backups" }));
    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    expect(screen.getByText("/tmp/desclop")).toBeInTheDocument();
  });

  it("opens Weekly Review from the shell and loads project records locally", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: false })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForProject.mockResolvedValue([]);
    listWorkEntriesForProject.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Review" }));

    expect(await screen.findByRole("heading", { name: "Weekly Review" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Tasks without next action" })).toBeInTheDocument();
    expect(listNotesForProject).toHaveBeenCalledWith("p1");
    expect(listWorkEntriesForProject).toHaveBeenCalledWith("p1");
    expect(listInboxItemsForProject).toHaveBeenCalledWith("p1");
  });

  it("refreshes local Git history when Weekly Review opens and explains freshness", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: true })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    syncGitCommits.mockResolvedValue([
      {
        sha: "review-commit",
        projectId: "p1",
        branch: "main",
        message: "Review snapshot",
        authorName: "Clyde",
        committedAt: "2026-06-16T10:00:00Z",
        changedFiles: []
      }
    ]);
    readCurrentGitBranch.mockResolvedValue("main");
    listNotesForProject.mockResolvedValue([]);
    listWorkEntriesForProject.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Review" }));

    expect(await screen.findByText(/Git history: synced/)).toBeInTheDocument();
    await waitFor(() => expect(syncGitCommits).toHaveBeenCalledTimes(2));
  });

  it("opens global Settings without a project and persists an appearance change", async () => {
    const user = userEvent.setup();
    onboardingStorage.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, settings: { theme: "light" } })
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toHaveValue("light");

    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    await user.click(screen.getByRole("checkbox", { name: /Show explanatory text/ }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.showExplanations).toBe("false");
    expect(JSON.parse(onboardingStorage.get(SETTINGS_STORAGE_KEY)!)).toEqual({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: expect.objectContaining({ theme: "dark", showExplanations: false })
    });
  });

  it("reopens the last opened project instead of the first saved project", async () => {
    const firstProject = projectFixture({ id: "p1", name: "First project" });
    const secondProject = projectFixture({ id: "p2", name: "Last project" });
    enableTauriApi();
    onboardingStorage.set(LAST_PROJECT_STORAGE_KEY, "p2");
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ projectId: "p2" }));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p2"));

    renderWithRouter(<App />);

    expect(await screen.findByText("Last project")).toBeInTheDocument();
    expect(screen.queryByText("First project")).not.toBeInTheDocument();
    expect(getResumeBrief).toHaveBeenCalledWith("p2");
    expect(loadProjectPlan).toHaveBeenCalledWith("p2");
  });

  it("opens Settings from the project picker after closing a project", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to projects" }));

    expect(screen.getByRole("heading", { name: "Open a project" })).toBeInTheDocument();
  });

  it("shows Timeline git events even when resume facts are unavailable", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: true })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ facts: [] }));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    readCurrentGitBranch.mockResolvedValue("main");
    syncGitCommits.mockResolvedValue([
      {
        sha: "recent1",
        projectId: "p1",
        branch: "main",
        message: "Add timeline screen",
        authorName: "Clyde",
        committedAt: "2026-05-20T11:00:00Z",
        changedFiles: ["apps/desktop/src/app/App.tsx"]
      }
    ]);

    renderWithRouter(<App />);

    expect(await screen.findByText("Current branch: main")).toBeInTheDocument();
    expect(readCurrentGitBranch).toHaveBeenCalledWith("p1");

    await user.click(await screen.findByRole("button", { name: "Timeline" }));

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("1 commit · No work reviews · No notes")).toBeInTheDocument();
    expect(screen.getByText("Add timeline screen")).toBeInTheDocument();
  });

  it("keeps the only-commits state when completed plan tasks have no timestamp", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: true })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ facts: [] }));
    const plan = importedPlanFixture("p1");
    loadProjectPlan.mockResolvedValue({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, status: "done" as const }))
    });
    syncGitCommits.mockResolvedValue([
      {
        sha: "recent1",
        projectId: "p1",
        branch: "main",
        message: "Add timeline screen",
        authorName: "Clyde",
        committedAt: "2026-05-20T11:00:00Z",
        changedFiles: ["apps/desktop/src/app/App.tsx"]
      }
    ]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Timeline" }));

    expect(await screen.findByText("Only commits so far")).toBeInTheDocument();
    expect(screen.getByText("Add timeline screen")).toBeInTheDocument();
    expect(screen.queryByText("Create local store")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Undated" })).not.toBeInTheDocument();
  });

  it("opens Import Plan from Today when the project has no plan", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import a plan" }));

    expect(screen.getByRole("heading", { name: "Import plan" })).toBeInTheDocument();
  });

  it("opens Plan from Today when a plan has no active task", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Pick a task from Plan" }));

    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
  });

  it("resumes the active project task from Today when the resume brief is empty", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    expect(await screen.findByRole("heading", { name: "Create local store" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set next action" }));

    expect(listNotesForTask).toHaveBeenCalledWith("p1", "t1");
    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
    expect(screen.getByText("Foundation task")).toBeInTheDocument();
  });

  it("keeps primary work and project destinations in the shell", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });

    renderWithRouter(<App />);

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(within(nav).getByText("Work")).toBeInTheDocument();
    expect(within(nav).getByText("Project")).toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Work" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Project" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(nav).getByRole("button", { name: "Import Plan" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Backups" })).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: "Import Plan" }));

    expect(await screen.findByRole("heading", { name: "Import plan" })).toBeInTheDocument();
    expect(
      within(await screen.findByRole("navigation", { name: "Primary" })).getByRole("button", {
        name: "Import Plan"
      })
    ).toHaveAttribute("aria-current", "page");
  });

  it("prevents duplicate markdown imports while import is pending", async () => {
    const user = userEvent.setup();
    let resolveImport: () => void = () => {};
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });
    importPlan.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveImport = resolve;
      })
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import Plan" }));
    fireEvent.change(screen.getByLabelText("Markdown plan"), {
      target: { value: "## Foundation\n- [ ] Create local store" }
    });
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await user.click(screen.getByRole("button", { name: "Import 1 task" }));

    expect(screen.getByRole("button", { name: "Importing plan" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Importing plan" }));
    expect(importPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveImport();
    });
  });

  it("shows import errors inline without clearing the draft", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ id: "p1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief("p1"));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    importPlan.mockRejectedValue(new Error("Plan already has task history"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Import Plan" }));
    fireEvent.change(screen.getByLabelText("Markdown plan"), {
      target: { value: "## New plan\n- [ ] New task" }
    });
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await user.click(screen.getByRole("button", { name: "Import 1 task" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not import plan.");
    expect(screen.getByLabelText("Markdown plan")).toHaveValue("## New plan\n- [ ] New task");
  });

  it("opens Plan from Today and continues a Plan task", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Continue Create local store" }));

    expect(listNotesForTask).toHaveBeenCalledWith("p1", "t1");
    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("guards Sidebar navigation while a changed plan draft is open", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Edit plan Build MVP" }));
    const title = screen.getByRole("textbox", { name: "Plan title" });
    await user.clear(title);
    await user.type(title, "Changed MVP");

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByRole("textbox", { name: "Plan title" })).toHaveValue("Changed MVP");

    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("region", { name: "Editing Build MVP" })).not.toBeInTheDocument();
  });

  it("guards a native quit request while a changed plan draft is open", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Edit plan Build MVP" }));
    await user.clear(screen.getByRole("textbox", { name: "Plan title" }));
    await user.type(screen.getByRole("textbox", { name: "Plan title" }), "Changed MVP");
    await waitFor(() =>
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "app-quit-requested",
        expect.any(Function)
      )
    );

    act(() => {
      emitTauriEvent("app-quit-requested");
    });

    expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(quitApp).not.toHaveBeenCalled();

    act(() => {
      emitTauriEvent("app-quit-requested");
    });
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(quitApp).toHaveBeenCalledTimes(1));
  });

  it("refreshes Today and Resume Brief from the saved plan editor snapshot", async () => {
    const user = userEvent.setup();
    const initialPlan = {
      plans: [
        {
          id: "plan-1",
          projectId: "p1",
          title: "Build MVP",
          position: 0
        }
      ],
      stages: [
        {
          id: "s1",
          projectId: "p1",
          planId: "plan-1",
          title: "Foundation",
          description: "Initial stage",
          position: 0,
          status: "current" as const
        },
        {
          id: "s2",
          projectId: "p1",
          planId: "plan-1",
          title: "Delivery",
          description: "Saved stage",
          position: 1,
          status: "future" as const
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Current task",
          description: "Move this task",
          status: "active" as const,
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 0
        },
        {
          id: "t2",
          projectId: "p1",
          stageId: "s1",
          title: "Second task",
          description: "Remove this empty task",
          status: "todo" as const,
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 1
        },
        {
          id: "t3",
          projectId: "p1",
          stageId: "s2",
          title: "Delivery task",
          description: "Keep this next",
          status: "todo" as const,
          priority: null,
          dueDate: null,
          nextStep: "Ship delivery",
          position: 0
        }
      ],
      checklistItems: []
    };
    const savedPlan = {
      ...initialPlan,
      tasks: [
        {
          ...initialPlan.tasks[0],
          stageId: "s2",
          position: 0
        },
        {
          ...initialPlan.tasks[2],
          position: 1
        }
      ]
    };

    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief
      .mockResolvedValueOnce(
        resumeBriefFixture({
          taskId: "t1",
          stageId: "s1",
          nextStep: "Stale resume next step"
        })
      )
      .mockResolvedValueOnce(
        resumeBriefFixture({
          taskId: "t1",
          stageId: "s2",
          nextStep: "Refreshed resume next step"
        })
      );
    loadProjectPlan.mockResolvedValueOnce(initialPlan).mockResolvedValueOnce(savedPlan);
    savePlanEditor.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Edit plan Build MVP" }));
    await user.click(screen.getByRole("button", { name: "Expand task Current task" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Task stage" }), "s2");
    await user.click(screen.getByRole("button", { name: "Move task Current task up" }));
    await user.click(screen.getByRole("button", { name: "Delete task Second task" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(savePlanEditor).toHaveBeenCalledTimes(1));
    expect(savePlanEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "plan-1",
        deletedTaskIds: ["t2"],
        tasks: [
          expect.objectContaining({ taskId: "t1", stageClientId: "s2", position: 0 }),
          expect.objectContaining({ taskId: "t3", stageClientId: "s2", position: 1 })
        ]
      })
    );
    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenCalledTimes(2);
      expect(getResumeBrief).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(await screen.findByRole("heading", { name: "Current task", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Refreshed resume next step")).toBeInTheDocument();
    expect(screen.queryByText("Stale resume next step")).not.toBeInTheDocument();
    const nextUp = screen.getByRole("article", { name: "Up next" });
    expect(within(nextUp).getByText("Delivery task")).toBeInTheDocument();
    expect(within(nextUp).queryByText("Second task")).not.toBeInTheDocument();
  });

  it("ignores a stale editor refresh after switching projects", async () => {
    const user = userEvent.setup();
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task"
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task"
    });
    const firstPlan = activeProjectPlanFixture({
      projectId: "p1",
      stageTitle: "First stage",
      taskTitle: "First project task",
      nextStep: "Continue first project"
    });
    const secondPlan = activeProjectPlanFixture({
      projectId: "p2",
      stageTitle: "Second stage",
      taskTitle: "Second project task",
      nextStep: "Continue second project"
    });
    const stalePlanRefresh = deferred<typeof firstPlan>();
    const staleResumeRefresh = deferred<ResumeBrief>();
    let firstPlanReads = 0;
    let firstResumeReads = 0;

    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    loadProjectPlan.mockImplementation(async (projectId) => {
      if (projectId === "p1") {
        firstPlanReads += 1;
        return firstPlanReads === 1 ? firstPlan : stalePlanRefresh.promise;
      }

      return secondPlan;
    });
    getResumeBrief.mockImplementation(async (projectId) => {
      if (projectId === "p1") {
        firstResumeReads += 1;
        return firstResumeReads === 1
          ? resumeBriefFixture({
              projectId,
              taskId: "p1-task",
              stageId: "p1-stage",
              latestNote: "First project resume",
              nextStep: "Continue first project"
            })
          : staleResumeRefresh.promise;
      }

      return resumeBriefFixture({
        projectId,
        taskId: "p2-task",
        stageId: "p2-stage",
        latestNote: "Second project resume",
        nextStep: "Continue second project"
      });
    });
    savePlanEditor.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Edit plan Build MVP" }));
    const title = screen.getByRole("textbox", { name: "Plan title" });
    await user.clear(title);
    await user.type(title, "Saved first project");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(savePlanEditor).toHaveBeenCalledTimes(1);
      expect(loadProjectPlan).toHaveBeenCalledTimes(2);
      expect(getResumeBrief).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    expect(screen.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(
      await screen.findByRole("button", { name: /Second Project.*Open project/s })
    );

    expect(await screen.findByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    expect(screen.getByText("Second project resume")).toBeInTheDocument();

    await act(async () => {
      stalePlanRefresh.resolve({
        ...firstPlan,
        stages: [{ ...firstPlan.stages[0], title: "Stale first stage" }],
        tasks: [{ ...firstPlan.tasks[0], title: "Stale first project task" }]
      });
      staleResumeRefresh.resolve(
        resumeBriefFixture({
          projectId: "p1",
          taskId: "p1-task",
          stageId: "p1-stage",
          latestNote: "Stale first project resume",
          nextStep: "Stale first project next step"
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    });
    expect(screen.getByText("Second project resume")).toBeInTheDocument();
    expect(screen.queryByText("Stale first project task")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale first project resume")).not.toBeInTheDocument();
  });

  it("opens Quick capture from Plan without navigating and defaults to the active task", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));

    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    expect(within(dialog).getByLabelText("Related to")).toHaveValue("t1");
    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
  });

  it.each([
    { modifier: "Meta", event: { metaKey: true } },
    { modifier: "Control", event: { ctrlKey: true } }
  ])("opens Quick capture with Shift+$modifier+C without navigating", async ({ event }) => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    fireEvent.keyDown(window, { key: "C", shiftKey: true, ...event });

    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
  });

  it("opens Quick capture when the native Tauri shortcut event is emitted", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    expect(tauriEventMock.listen).toHaveBeenCalledWith(
      "quick-capture:open",
      expect.any(Function)
    );

    act(() => {
      emitTauriEvent("quick-capture:open");
    });

    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
  });

  it("does not install the native Quick capture listener outside Tauri", () => {
    renderWithRouter(<App />);

    expect(tauriEventMock.listen).not.toHaveBeenCalled();
  });

  it("cleans up the native Quick capture listener on unmount", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    const { unmount } = renderWithRouter(<App />);

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(
        "quick-capture:open",
        expect.any(Function)
      );
    });

    unmount();

    expect(tauriEventMock.unlisten).toHaveBeenCalledWith("quick-capture:open");
  });

  it("saves Quick capture to the Plan active task and reports the task title", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Record the plan decision",
      kind: "note",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });
    attachInboxItemToTask.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: "t1",
      body: "Record the plan decision",
      kind: "note",
      status: "attached",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Record the plan decision");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Record the plan decision",
      kind: "note"
    });
    expect(attachInboxItemToTask).toHaveBeenCalledWith({ itemId: "i1", taskId: "t1" });
    expect(captureInboxItem.mock.invocationCallOrder[0]).toBeLessThan(
      attachInboxItemToTask.mock.invocationCallOrder[0]
    );
    expect(await screen.findByText("Captured to Task: Create local store")).toBeInTheDocument();
  });

  it("ignores repeated global capture opens while a save is pending", async () => {
    const user = userEvent.setup();
    const pendingCapture = deferred<Awaited<ReturnType<typeof api.captureInboxItem>>>();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem.mockReturnValue(pendingCapture.promise);
    attachInboxItemToTask.mockResolvedValue({
      id: "i-pending",
      projectId: "p1",
      taskId: "t1",
      body: "Preserve this pending capture",
      kind: "note",
      status: "attached",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(
      within(dialog).getByLabelText("Capture"),
      "Preserve this pending capture"
    );
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    fireEvent.keyDown(window, { key: "C", shiftKey: true, metaKey: true });

    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBe(dialog);
    expect(within(dialog).getByLabelText("Capture")).toHaveValue(
      "Preserve this pending capture"
    );
    expect(within(dialog).getByRole("button", { name: "Saving capture" })).toBeDisabled();

    await act(async () => {
      pendingCapture.resolve({
        id: "i-pending",
        projectId: "p1",
        taskId: null,
        body: "Preserve this pending capture",
        kind: "note",
        status: "open",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      });
    });

    expect(attachInboxItemToTask).toHaveBeenCalledTimes(1);
    expect(attachInboxItemToTask).toHaveBeenCalledWith({
      itemId: "i-pending",
      taskId: "t1"
    });
    expect(await screen.findByText("Captured to Task: Create local store")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();
  });

  it("saves Quick capture to Inbox without attaching it", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Review the loose idea",
      kind: "question",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    await user.click(
      within(await screen.findByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.selectOptions(within(dialog).getByLabelText("Related to"), "__inbox__");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "question");
    await user.type(within(dialog).getByLabelText("Capture"), "Review the loose idea");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Review the loose idea",
      kind: "question"
    });
    expect(attachInboxItemToTask).not.toHaveBeenCalled();
    expect(await screen.findByText("Captured to Inbox")).toBeInTheDocument();
  });

  it("rolls back a captured item when attaching fails and allows a clean retry", async () => {
    const user = userEvent.setup();
    const firstItem = {
      id: "i-failed",
      projectId: "p1",
      taskId: null,
      body: "Retry this capture",
      kind: "note" as const,
      status: "open" as const,
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    };
    const retriedItem = { ...firstItem, id: "i-retried" };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem
      .mockResolvedValueOnce(firstItem)
      .mockResolvedValueOnce(retriedItem);
    attachInboxItemToTask
      .mockRejectedValueOnce(new Error("attach failed"))
      .mockResolvedValueOnce({
        ...retriedItem,
        taskId: "t1",
        status: "attached"
      });
    deleteInboxItem.mockResolvedValue({
      ...firstItem,
      status: "deleted"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Retry this capture");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not save capture."
    );
    expect(deleteInboxItem).toHaveBeenCalledWith("i-failed");
    expect(within(dialog).getByLabelText("Capture")).toHaveValue("Retry this capture");
    expect(screen.queryByText("Captured to Task: Create local store")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(attachInboxItemToTask).toHaveBeenLastCalledWith({
      itemId: "i-retried",
      taskId: "t1"
    });
    expect(deleteInboxItem).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Captured to Task: Create local store")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();
  });

  it("closes capture and refreshes Task Detail when attachment and rollback are indeterminate", async () => {
    const user = userEvent.setup();
    const capturedItem = {
      id: "i-indeterminate",
      projectId: "p1",
      taskId: null,
      body: "Check attachment state",
      kind: "note" as const,
      status: "open" as const,
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    };
    const attachedItem = {
      ...capturedItem,
      taskId: "t1",
      status: "attached" as const
    };
    const openInboxItem = {
      ...capturedItem,
      id: "i-open",
      body: "Open Inbox context"
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Run tests" })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([attachedItem]);
    listInboxItemsForProject
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([openInboxItem]);
    captureInboxItem.mockResolvedValue(capturedItem);
    attachInboxItemToTask.mockRejectedValue(new Error("attach uncertain"));
    deleteInboxItem.mockRejectedValue(new Error("rollback uncertain"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Check attachment state");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(
      await screen.findByText(
        "Capture was saved, but task attachment could not be confirmed. Check Inbox before retrying."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();
    expect(screen.queryByText("Captured to Task: Create local store")).not.toBeInTheDocument();
    expect(screen.queryByText("Captured to Inbox")).not.toBeInTheDocument();
    expect(captureInboxItem).toHaveBeenCalledTimes(1);
    expect(attachInboxItemToTask).toHaveBeenCalledTimes(1);
    expect(deleteInboxItem).toHaveBeenCalledTimes(1);
    expect(listInboxItemsForTask).toHaveBeenLastCalledWith("p1", "t1");
    expect(listInboxItemsForProject).toHaveBeenLastCalledWith("p1");
    expect(screen.getByText("Check attachment state")).toBeInTheDocument();
    expect(screen.getByText("Open Inbox context")).toBeInTheDocument();
    expect(screen.getByText("2 inbox items")).toBeInTheDocument();
  });

  it("does not attach a captured item after its task-target session becomes stale", async () => {
    const user = userEvent.setup();
    const pendingCapture = deferred<Awaited<ReturnType<typeof api.captureInboxItem>>>();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem.mockReturnValue(pendingCapture.promise);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Capture" }));
    let dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Leave this in Inbox");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));
    fireEvent.keyDown(dialog, { key: "Escape" });

    await user.click(screen.getByRole("button", { name: "Capture" }));
    dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "New capture session");

    await act(async () => {
      pendingCapture.resolve({
        id: "i-stale",
        projectId: "p1",
        taskId: null,
        body: "Leave this in Inbox",
        kind: "note",
        status: "open",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      });
    });

    expect(attachInboxItemToTask).not.toHaveBeenCalled();
    expect(deleteInboxItem).not.toHaveBeenCalled();
    expect(screen.queryByText("Captured to Task: Create local store")).not.toBeInTheDocument();
    expect(screen.queryByText("Captured to Inbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Capture")).toHaveValue("New capture session");
    expect(screen.getByRole("heading", { name: "Foundation" })).toBeInTheDocument();
  });

  it("preserves the Task Detail rail when indeterminate recovery reads fail", async () => {
    const user = userEvent.setup();
    const existingItem = {
      id: "i-existing",
      projectId: "p1",
      taskId: "t1",
      body: "Existing rail context",
      kind: "question" as const,
      status: "attached" as const,
      createdAt: "2026-05-20T09:00:00Z",
      updatedAt: "2026-05-20T09:00:00Z"
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Run tests" })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask
      .mockResolvedValueOnce([existingItem])
      .mockRejectedValueOnce(new Error("task inbox unavailable"));
    listInboxItemsForProject
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("project inbox unavailable"));
    captureInboxItem.mockResolvedValue({
      ...existingItem,
      id: "i-indeterminate",
      taskId: null,
      body: "Uncertain capture",
      status: "open"
    });
    attachInboxItemToTask.mockRejectedValue(new Error("attach uncertain"));
    deleteInboxItem.mockRejectedValue(new Error("rollback uncertain"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    expect(await screen.findByText("Existing rail context")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Uncertain capture");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(
      await screen.findByText(
        "Capture was saved, but task attachment could not be confirmed. Check Inbox before retrying."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();
    expect(screen.getByText("Existing rail context")).toBeInTheDocument();
    expect(screen.getByText("1 inbox items")).toBeInTheDocument();
    expect(screen.queryByText("Uncertain capture")).not.toBeInTheDocument();
  });

  it("ignores a stale task capture after a newer Inbox capture completes", async () => {
    const user = userEvent.setup();
    const pendingAttach = deferred<Awaited<ReturnType<typeof api.attachInboxItemToTask>>>();
    const taskItem = {
      id: "i-task",
      projectId: "p1",
      taskId: null,
      body: "Stale task capture",
      kind: "note" as const,
      status: "open" as const,
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    };
    const inboxItem = {
      ...taskItem,
      id: "i-inbox",
      body: "Current inbox capture"
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Run tests" })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);
    captureInboxItem
      .mockResolvedValueOnce(taskItem)
      .mockResolvedValueOnce(inboxItem);
    attachInboxItemToTask.mockReturnValueOnce(pendingAttach.promise);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    let dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Stale task capture");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.selectOptions(within(dialog).getByLabelText("Related to"), "__inbox__");
    await user.type(within(dialog).getByLabelText("Capture"), "Current inbox capture");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(await screen.findByText("Captured to Inbox")).toBeInTheDocument();
    expect(screen.getByText("Current inbox capture")).toBeInTheDocument();

    await act(async () => {
      pendingAttach.resolve({
        ...taskItem,
        taskId: "t1",
        status: "attached"
      });
    });

    expect(screen.getByText("Captured to Inbox")).toBeInTheDocument();
    expect(screen.queryByText("Captured to Task: Create local store")).not.toBeInTheDocument();
    expect(screen.getByText("Current inbox capture")).toBeInTheDocument();
    expect(screen.queryByText("Stale task capture")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument();
  });

  it("defaults Quick capture to the current Focus session task", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Run repository tests" })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    fireEvent.keyDown(window, { key: "c", shiftKey: true, ctrlKey: true });

    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    expect(within(dialog).getByLabelText("Related to")).toHaveValue("t1");
    expect(screen.getByRole("button", { name: "Finish session" })).toBeInTheDocument();
  });

  it("does not reinstall the global capture listener on Focus timer ticks", async () => {
    const user = userEvent.setup();
    const addEventListener = vi.spyOn(window, "addEventListener");
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ taskId: "t1", stageId: "s1", nextStep: "Run repository tests" })
    );
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
    const keydownListenerCount = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "keydown"
    ).length;

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      addEventListener.mock.calls.filter(([eventName]) => eventName === "keydown")
    ).toHaveLength(keydownListenerCount);
    addEventListener.mockRestore();
  });

  it("opens a completed Plan task without activating it", async () => {
    const user = userEvent.setup();
    const importedPlan = importedPlanFixture("p1");
    const plan = {
      ...importedPlan,
      stages: [
        {
          ...importedPlan.stages[0],
          id: "completed-stage",
          status: "completed" as const
        }
      ],
      tasks: [
        {
          ...importedPlan.tasks[0],
          stageId: "completed-stage",
          title: "Publish release notes",
          status: "done" as const
        }
      ]
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(plan);
    setActiveTask.mockResolvedValue(undefined);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Show plan Build MVP" }));
    await user.click(screen.getByRole("button", { name: "Expand stage Foundation" }));
    await user.click(
      screen.getByRole("button", { name: "Open Publish release notes" })
    );

    expect(setActiveTask).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Publish release notes" })
    ).toBeInTheDocument();
  });

  it("ignores pending task context after switching projects", async () => {
    const user = userEvent.setup();
    let resolveFirstTaskNotes: (
      notes: Awaited<ReturnType<typeof api.listNotesForTask>>
    ) => void = () => {};
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task"
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task"
    });
    enableTauriApi();
    listProjects.mockResolvedValueOnce([firstProject, secondProject]);
    getResumeBrief
      .mockResolvedValueOnce(
        resumeBriefFixture({
          projectId: "p1",
          taskId: "p1-task",
          stageId: "p1-stage",
          nextStep: "Continue first project"
        })
      )
      .mockResolvedValueOnce(
        resumeBriefFixture({
          id: "p2-resume",
          projectId: "p2",
          taskId: "p2-task",
          stageId: "p2-stage",
          nextStep: "Continue second project"
        })
      );
    loadProjectPlan
      .mockResolvedValueOnce(
        activeProjectPlanFixture({
          projectId: "p1",
          stageTitle: "First stage",
          taskTitle: "First project task",
          nextStep: "Continue first project"
        })
      )
      .mockResolvedValueOnce(
        activeProjectPlanFixture({
          projectId: "p2",
          stageTitle: "Second stage",
          taskTitle: "Second project task",
          nextStep: "Continue second project"
        })
      );
    listNotesForTask
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstTaskNotes = resolve;
        })
      )
      .mockResolvedValueOnce([
        {
          id: "p2-note",
          projectId: "p2",
          taskId: "p2-task",
          body: "Second project task note",
          createdAt: "2026-05-20T12:01:00Z"
        }
      ]);
    listWorkEntriesForTask.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    listInboxItemsForTask.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    listInboxItemsForProject.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await waitFor(() => {
      expect(listNotesForTask).toHaveBeenCalledWith("p1", "p1-task");
    });

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    );
    await user.click(await screen.findByRole("button", { name: "Continue task" }));

    expect(
      await screen.findByRole("heading", { name: "Second project task" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Second project task note")).toBeInTheDocument();

    await act(async () => {
      resolveFirstTaskNotes([
        {
          id: "p1-note",
          projectId: "p1",
          taskId: "p1-task",
          body: "Stale first project task note",
          createdAt: "2026-05-20T12:00:00Z"
        }
      ]);
    });

    expect(screen.getByRole("complementary", { name: "Application" })).toHaveTextContent(
      "Second Project"
    );
    expect(screen.getByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    expect(screen.getByText("Second project task note")).toBeInTheDocument();
    expect(screen.queryByText("Stale first project task note")).not.toBeInTheDocument();
  });

  it("activates a Plan task so Today can resume it", async () => {
    const user = userEvent.setup();
    const plan = importedPlanFixture("p1");
    plan.tasks[0] = { ...plan.tasks[0], nextStep: "Run visual QA" };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: null })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(plan);
    setActiveTask.mockResolvedValue(undefined);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Continue Create local store" }));
    await user.click(await screen.findByRole("button", { name: "Today" }));

    expect(setActiveTask).toHaveBeenCalledWith("p1", "t1");
    expect(await screen.findByRole("heading", { name: "Create local store" })).toBeInTheDocument();
    expect(screen.getByText("Run visual QA")).toBeInTheDocument();
  });

  it("shows a saved Task Detail next step on Today instead of stale resume context", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: "Old next step"
    });
    loadProjectPlan.mockResolvedValue({
      ...importedPlanFixture("p1"),
      tasks: [
        {
          ...importedPlanFixture("p1").tasks[0],
          status: "active",
          nextStep: "Old next step"
        }
      ]
    });
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    updateNextStep.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.clear(screen.getByLabelText("Next action"));
    await user.type(screen.getByLabelText("Next action"), "Review updated spec");
    await user.click(screen.getByRole("button", { name: "Save next action" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(updateNextStep).toHaveBeenCalledWith("t1", "Review updated spec");
    expect(await screen.findByText("Review updated spec")).toBeInTheDocument();
    expect(screen.queryByText("Old next step")).not.toBeInTheDocument();
  });

  it("reloads the project plan after activating a task so demoted tasks do not stay active locally", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ id: "p1", activeTaskId: "t1" })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ projectId: "p1", taskId: "t1" }));
    loadProjectPlan
      .mockResolvedValueOnce(
        twoTaskPlanFixture({
          firstStatus: "active",
          secondStatus: "todo"
        })
      )
      .mockResolvedValueOnce(
        twoTaskPlanFixture({
          firstStatus: "todo",
          secondStatus: "active"
        })
      );
    vi.mocked(api.updateTaskStatus).mockResolvedValue(undefined);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Continue Second task" }));
    await user.selectOptions(screen.getByLabelText("Task status"), "active");
    await user.click(screen.getByRole("button", { name: "Plan" }));

    expect(api.updateTaskStatus).toHaveBeenCalledWith("t2", "active");
    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      const firstTaskRow = screen.getByText("First task").closest(".task-row");
      const secondTaskRow = screen.getByText("Second task").closest(".task-row");

      expect(firstTaskRow).not.toBeNull();
      expect(secondTaskRow).not.toBeNull();
      expect(within(firstTaskRow as HTMLElement).getByText("To do")).toBeInTheDocument();
      expect(within(secondTaskRow as HTMLElement).getByText("Active")).toBeInTheDocument();
    });
  });

  it("syncs Git before completing the active task and refreshes its linked commits", async () => {
    const user = userEvent.setup();
    const activePlan = twoTaskPlanFixture({
      firstStatus: "active",
      secondStatus: "todo"
    });
    const initialPlan = {
      ...activePlan,
      tasks: [
        { ...activePlan.tasks[0], nextStep: "Close the history protection task" },
        activePlan.tasks[1]
      ]
    };
    const completedPlan = {
      ...initialPlan,
      tasks: initialPlan.tasks.map((task) =>
        task.id === "t1" ? { ...task, status: "done" as const } : task
      )
    };
    const linkedCommit = {
      sha: "finish123",
      projectId: "p1",
      branch: "main",
      message: "Protect task history",
      authorName: "Clyde",
      committedAt: "2026-07-27T10:00:00Z",
      changedFiles: []
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: true })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    getResumeBrief.mockResolvedValueOnce(
      resumeBriefFixture({ projectId: "p1", taskId: "t1", stageId: "s1" })
    );
    loadProjectPlan
      .mockResolvedValueOnce(initialPlan)
      .mockResolvedValueOnce(completedPlan);
    syncGitCommits.mockResolvedValueOnce([]).mockResolvedValueOnce([linkedCommit]);
    readCurrentGitBranch.mockResolvedValue("main");
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listLinkedCommitsForTask.mockResolvedValueOnce([]).mockResolvedValueOnce([linkedCommit]);
    vi.mocked(api.updateTaskStatus).mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    expect(await screen.findByText("0 linked commits")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Task status"), "done");

    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("t1", "done");
    });
    expect(await screen.findByText("1 linked commits")).toBeInTheDocument();
    expect(screen.getByText("Protect task history")).toBeInTheDocument();

    const completionSyncCall = syncGitCommits.mock.invocationCallOrder[1];
    const statusUpdateCall = vi.mocked(api.updateTaskStatus).mock.invocationCallOrder[0];
    expect(completionSyncCall).toBeLessThan(statusUpdateCall);
  });

  it("ignores a pending task status refresh after switching projects", async () => {
    const user = userEvent.setup();
    let resolveStatusUpdate: () => void = () => {};
    const firstProject = projectFixture({
      id: "p1",
      name: "First Project",
      activeTaskId: "p1-task"
    });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project",
      activeTaskId: "p2-task"
    });
    const firstPlan = activeProjectPlanFixture({
      projectId: "p1",
      stageTitle: "First stage",
      taskTitle: "First project task",
      nextStep: "Continue first project"
    });
    const secondPlan = activeProjectPlanFixture({
      projectId: "p2",
      stageTitle: "Second stage",
      taskTitle: "Second project task",
      nextStep: "Continue second project"
    });
    const staleFirstPlan = activeProjectPlanFixture({
      projectId: "p1",
      stageTitle: "Stale first stage",
      taskTitle: "Stale first project task",
      nextStep: "Stale first next step"
    });
    enableTauriApi();
    listProjects.mockResolvedValueOnce([firstProject, secondProject]);
    getResumeBrief
      .mockResolvedValueOnce(
        resumeBriefFixture({
          projectId: "p1",
          taskId: "p1-task",
          stageId: "p1-stage",
          nextStep: "Continue first project"
        })
      )
      .mockResolvedValueOnce(
        resumeBriefFixture({
          id: "p2-resume",
          projectId: "p2",
          taskId: "p2-task",
          stageId: "p2-stage",
          nextStep: "Continue second project"
        })
      )
      .mockResolvedValueOnce(
        resumeBriefFixture({
          id: "p1-stale-resume",
          projectId: "p1",
          taskId: "p1-task",
          stageId: "p1-stage",
          latestNote: "Stale first resume",
          nextStep: "Stale first next step"
        })
      );
    loadProjectPlan
      .mockResolvedValueOnce(firstPlan)
      .mockResolvedValueOnce(secondPlan)
      .mockResolvedValueOnce(staleFirstPlan);
    listNotesForTask.mockResolvedValueOnce([]);
    listWorkEntriesForTask.mockResolvedValueOnce([]);
    listInboxItemsForTask.mockResolvedValueOnce([]);
    listInboxItemsForProject.mockResolvedValueOnce([]);
    vi.mocked(api.updateTaskStatus).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveStatusUpdate = resolve;
      })
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.selectOptions(screen.getByLabelText("Task status"), "blocked");
    await waitFor(() => {
      expect(api.updateTaskStatus).toHaveBeenCalledWith("p1-task", "blocked");
    });

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    );
    expect(
      await screen.findByRole("heading", { name: "Second project task" })
    ).toBeInTheDocument();

    await act(async () => {
      resolveStatusUpdate();
    });

    expect(screen.getByRole("complementary", { name: "Application" })).toHaveTextContent(
      "Second Project"
    );
    expect(screen.getByRole("heading", { name: "Second project task" })).toBeInTheDocument();
    expect(screen.queryByText("Stale first project task")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale first resume")).not.toBeInTheDocument();
  });

  it("shows open project inbox captures in the Task Detail rail", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: "Run repository tests"
    });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    const inboxItem = {
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Check narrow desktop layout",
      kind: "question",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    } as const;
    captureInboxItem.mockResolvedValue(inboxItem);
    listInboxItemsForProject.mockResolvedValue([inboxItem]);

    renderWithRouter(<App />);

    await user.click(
      within(await screen.findByRole("complementary", { name: "Application" })).getByRole(
        "button",
        { name: "Capture" }
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.selectOptions(within(dialog).getByLabelText("Related to"), "__inbox__");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "question");
    await user.type(within(dialog).getByLabelText("Capture"), "Check narrow desktop layout");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));
    await user.click(screen.getByRole("button", { name: "Continue task" }));

    expect(await screen.findByText("1 inbox items")).toBeInTheDocument();
    expect(screen.getByText("Check narrow desktop layout")).toBeInTheDocument();
  });

  it("captures and attaches inbox items from the global overlay while Task Detail is current", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: "Run repository tests"
    });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask.mockResolvedValue([
      {
        id: "i-attached",
        projectId: "p1",
        taskId: "t1",
        body: "Attached inbox context",
        kind: "question",
        status: "attached",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    captureInboxItem.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Check task export shape",
      kind: "question",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });
    attachInboxItemToTask.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: "t1",
      body: "Check task export shape",
      kind: "question",
      status: "attached",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    expect(await screen.findByText("Attached inbox context")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("complementary", { name: "Application" })).getByRole("button", {
        name: "Capture"
      })
    );
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    expect(within(dialog).getByLabelText("Related to")).toHaveValue("t1");
    await user.type(within(dialog).getByLabelText("Capture"), "Check task export shape");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "question");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Check task export shape",
      kind: "question"
    });
    expect(attachInboxItemToTask).toHaveBeenCalledWith({ itemId: "i1", taskId: "t1" });
    expect(await screen.findByText("Captured to Task: Create local store")).toBeInTheDocument();
    expect(screen.getByText("Check task export shape")).toBeInTheDocument();
  });

  it("creates a manual work review from Task Detail and refreshes resume context", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Old next step"
      })
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Run cargo test"
      });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "manual" as const,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: "Reviewed schema",
      remains: "Run backend tests",
      nextStep: "Run cargo test",
      createdAt: "2026-05-20T10:01:30Z"
    });
    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Add work review" }));
    await user.type(screen.getByLabelText("What changed?"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains?"), "Run backend tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(createWorkEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        taskId: "t1",
        source: "manual" as const,
        durationSeconds: null,
        done: "Reviewed schema",
        remains: "Run backend tests",
        nextStep: "Run cargo test"
      })
    );
    expect(updateNextStep).not.toHaveBeenCalled();
    expect(getResumeBrief).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate manual work entries after refreshing Task Detail context", async () => {
    const user = userEvent.setup();
    const manualEntry = {
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "manual" as const,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: "Reviewed schema",
      remains: "Run backend tests",
      nextStep: "Run cargo test",
      createdAt: "2026-05-20T10:01:30Z"
    };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Old next step"
      })
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Run cargo test"
      });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([manualEntry]);
    createWorkEntry.mockResolvedValue(manualEntry);
    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Add work review" }));
    await user.type(screen.getByLabelText("What changed?"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains?"), "Run backend tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(await screen.findByText("Reviewed schema")).toBeInTheDocument();
    expect(screen.getAllByText("Reviewed schema")).toHaveLength(1);
    expect(listWorkEntriesForTask).toHaveBeenCalledTimes(2);
    expect(updateNextStep).not.toHaveBeenCalled();
  });

  it("creates a manual work review from Today and returns to Task Detail for the resumable task", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Old next step"
      })
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Run cargo test"
      });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "manual" as const,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: "Reviewed schema",
      remains: "Run backend tests",
      nextStep: "Run cargo test",
      createdAt: "2026-05-20T10:01:30Z"
    });
    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Add manual work review" }));
    await user.type(screen.getByLabelText("What changed?"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains?"), "Run backend tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(createWorkEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        taskId: "t1",
        source: "manual" as const,
        durationSeconds: null,
        done: "Reviewed schema",
        remains: "Run backend tests",
        nextStep: "Run cargo test"
      })
    );
    expect(updateNextStep).not.toHaveBeenCalled();
    expect(getResumeBrief).toHaveBeenCalledTimes(2);
    expect(listNotesForTask).toHaveBeenCalledWith("p1", "t1");
    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("persists no meaningful progress for an empty reviewed manual save", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Old next step"
      })
      .mockResolvedValueOnce({
        ...emptyResumeBrief(),
        taskId: "t1",
        stageId: "s1",
        nextStep: "Old next step"
      });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "manual" as const,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      done: "No meaningful progress",
      remains: "",
      nextStep: "",
      createdAt: "2026-05-20T10:01:30Z"
    });
    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Add manual work review" }));
    await user.click(screen.getByLabelText("No meaningful progress"));
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(createWorkEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        taskId: "t1",
        source: "manual" as const,
        durationSeconds: null,
        done: "No meaningful progress",
        remains: "",
        nextStep: ""
      })
    );
    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("shows a focus review next step on Today instead of stale resume context", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: "Old next step"
    });
    loadProjectPlan.mockResolvedValue({
      ...importedPlanFixture("p1"),
      tasks: [
        {
          ...importedPlanFixture("p1").tasks[0],
          status: "active",
          nextStep: "Old next step"
        }
      ]
    });
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00Z",
      endedAt: "2026-05-20T10:01:30Z",
      durationSeconds: 90,
      done: "Reviewed alpha flow",
      remains: "Run browser screenshots",
      nextStep: "Capture final screenshots",
      createdAt: "2026-05-20T10:01:30Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await user.click(screen.getByRole("button", { name: "Finish session" }));
    await user.type(screen.getByLabelText("What changed?"), "Reviewed alpha flow");
    await user.type(screen.getByLabelText("What remains?"), "Run browser screenshots");
    await user.type(screen.getByLabelText("Next action"), "Capture final screenshots");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    await user.click(screen.getByRole("button", { name: "Today" }));

    expect(await screen.findByText("Capture final screenshots")).toBeInTheDocument();
    expect(screen.queryByText("Old next step")).not.toBeInTheDocument();
  });

  it("persists a focus session from task detail through work review", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: [
        { id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }
      ]
    });
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    addNote.mockResolvedValue({
      id: "n1",
      projectId: "p1",
      taskId: "t1",
      body: "Keep this focus note",
      createdAt: "2026-05-20T10:01:30Z"
    });
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00Z",
      endedAt: "2026-05-20T10:01:30Z",
      durationSeconds: 90,
      done: "Added migration",
      remains: "Repository tests",
      nextStep: "Run cargo test",
      createdAt: "2026-05-20T10:01:30Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
    act(() => {
      vi.advanceTimersByTime(90000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Task note"), {
      target: { value: "Keep this focus note" }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    });
    expect(screen.getByText("Keep this focus note")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    });
    vi.useRealTimers();
    expect(screen.getByLabelText("What changed?")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What changed?"), "Added migration");
    await user.type(screen.getByLabelText("What remains?"), "Repository tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(addNote).toHaveBeenCalledWith("p1", "t1", "Keep this focus note");
    expect(createWorkEntry).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00.000Z",
      endedAt: "2026-05-20T10:01:30.000Z",
      durationSeconds: 90,
      done: "Added migration",
      remains: "Repository tests",
      nextStep: "Run cargo test"
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Next action")).toHaveValue("Run cargo test");
    });
  });

  it("persists a focus session without review from task detail", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00Z",
      endedAt: "2026-05-20T10:01:30Z",
      durationSeconds: 90,
      done: "Unreviewed focus session",
      remains: "",
      nextStep: "",
      createdAt: "2026-05-20T10:01:30Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
    act(() => {
      vi.advanceTimersByTime(90000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    });
    vi.useRealTimers();
    await user.click(screen.getByRole("button", { name: "Save session without review" }));

    expect(createWorkEntry).toHaveBeenCalledWith({
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00.000Z",
      endedAt: "2026-05-20T10:01:30.000Z",
      durationSeconds: 90,
      done: "Unreviewed focus session",
      remains: "",
      nextStep: ""
    });
    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("persists checklist toggles during focus mode through the API", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: [
        { id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }
      ]
    });
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    updateChecklistItem.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await user.click(screen.getByRole("checkbox", { name: "Add migration" }));

    expect(updateChecklistItem).toHaveBeenCalledWith("c1", true);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Add migration" })).toBeChecked();
    });
  });

  it("starts timebox focus and captures through the global Quick Capture overlay", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: []
    });
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    captureInboxItem.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Remember repository tests",
      kind: "note",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.clear(screen.getByLabelText("Timebox"));
    await user.type(screen.getByLabelText("Timebox"), "5");
    await user.click(screen.getByRole("button", { name: "Start focus" }));

    expect(screen.getByText("05:00 remaining")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Capture" }));
    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    await user.type(within(dialog).getByLabelText("Capture"), "Remember repository tests");
    await user.selectOptions(within(dialog).getByLabelText("Type"), "note");
    await user.click(within(dialog).getByRole("button", { name: "Save capture" }));

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Remember repository tests",
      kind: "note"
    });
  });

  it("represents unavailable resume context without failing the project load", async () => {
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: false,
        gitRemote: null,
        activeTaskId: null,
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockRejectedValue(new Error("resume unavailable"));
    loadProjectPlan.mockResolvedValue({
      stages: [],
      tasks: [],
      checklistItems: []
    });

    renderWithRouter(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent("Resume context unavailable.");
    expect(screen.queryByText("Project loading failed")).not.toBeInTheDocument();
  });

  it("represents unavailable git context without blocking project workflows", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: true,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: []
    });
    syncGitCommits.mockRejectedValue(new Error("not a git repository"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listLinkedCommitsForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent("Git unavailable");
    expect(syncGitCommits).toHaveBeenCalledWith("p1");
    expect(syncGitCommits).not.toHaveBeenCalledWith("p1", "/tmp/desclop");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No repository was found in this folder. Desclop still works without Git."
    );
    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue task" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Dismiss Git unavailable notification" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue task" }));

    expect(await screen.findByRole("button", { name: "Start focus" })).toBeInTheDocument();
    expect(screen.getByText("0 linked commits")).toBeInTheDocument();
  });

  it("keeps recent git activity separate from task linked commits", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([
      {
        id: "p1",
        name: "Desclop",
        localPath: "/tmp/desclop",
        gitEnabled: true,
        gitRemote: null,
        activeTaskId: "t1",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z"
      }
    ]);
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: "t1",
      stageId: "s1",
      latestNote: "",
      nextStep: "Run repository tests",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        }
      ],
      checklistItems: []
    });
    syncGitCommits.mockResolvedValue([
      {
        sha: "recent1",
        projectId: "p1",
        branch: "main",
        message: "Recent unrelated work",
        authorName: "Clyde",
        committedAt: "2026-05-20T10:00:00Z",
        changedFiles: []
      },
      {
        sha: "recent2",
        projectId: "p1",
        branch: "main",
        message: "Another recent commit",
        authorName: "Clyde",
        committedAt: "2026-05-20T10:10:00Z",
        changedFiles: []
      }
    ]);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listLinkedCommitsForTask.mockResolvedValue([
      {
        sha: "linked1",
        projectId: "p1",
        branch: "main",
        message: "Linked task work",
        authorName: "Clyde",
        committedAt: "2026-05-20T10:05:00Z",
        changedFiles: []
      }
    ]);

    renderWithRouter(<App />);

    expect(await screen.findByText("2 recent commits captured on main")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue task" }));

    expect(listLinkedCommitsForTask).toHaveBeenCalledWith("p1", "t1");
    expect(await screen.findByText("1 linked commits")).toBeInTheDocument();
  });

  it("unlinks and moves linked commits from Task Detail then reloads task context", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: true })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: "Run repository tests"
    });
    loadProjectPlan.mockResolvedValue({
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create local store",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run repository tests",
          position: 0
        },
        {
          id: "t2",
          projectId: "p1",
          stageId: "s1",
          title: "Other task",
          description: "",
          status: "todo",
          priority: null,
          dueDate: null,
          nextStep: "",
          position: 1
        }
      ],
      checklistItems: []
    });
    syncGitCommits.mockResolvedValue([]);
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);
    listLinkedCommitsForTask
      .mockResolvedValueOnce([
        {
          sha: "abc123",
          projectId: "p1",
          branch: "main",
          message: "Fix import",
          authorName: "Clyde",
          committedAt: "2026-05-20T10:00:00Z",
          changedFiles: ["src/app/App.tsx"]
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          sha: "def456",
          projectId: "p1",
          branch: "main",
          message: "Move follow-up",
          authorName: "Clyde",
          committedAt: "2026-05-20T10:05:00Z",
          changedFiles: ["src/features/task-detail/TaskDetail.tsx"]
        }
      ])
      .mockResolvedValueOnce([]);
    unlinkCommit.mockResolvedValue(undefined);
    moveCommitLink.mockResolvedValue(undefined);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      await screen.findByRole("button", { name: "Remove abc123 from task" })
    );

    expect(unlinkCommit).toHaveBeenCalledWith("abc123", "t1");
    await waitFor(() => {
      expect(listLinkedCommitsForTask).toHaveBeenLastCalledWith("p1", "t1");
    });
    expect(await screen.findByText("0 linked commits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Show commit details for def456"
      })
    );
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Move def456 to task" }),
      "t2"
    );
    await user.click(screen.getByRole("button", { name: "Move def456 to task" }));

    expect(moveCommitLink).toHaveBeenCalledWith("def456", "t1", "t2");
    await waitFor(() => {
      expect(listLinkedCommitsForTask).toHaveBeenLastCalledWith("p1", "t1");
    });
  });

  it("does not reload stale task context after a deferred unlink", async () => {
    const user = userEvent.setup();
    const pendingUnlink = deferred<void>();
    let firstTaskNoteLoads = 0;
    const plan = twoTaskPlanFixture({ firstStatus: "active", secondStatus: "done" });
    plan.tasks[0] = { ...plan.tasks[0], nextStep: "Continue testing" };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: true })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: ""
    });
    loadProjectPlan.mockResolvedValue(plan);
    syncGitCommits.mockResolvedValue([]);
    listNotesForTask.mockImplementation((_projectId, taskId) => {
      if (taskId === "t2") {
        return Promise.resolve([
          {
            id: "note-b",
            projectId: "p1",
            taskId: "t2",
            body: "Task B context",
            createdAt: "2026-05-20T10:00:00Z"
          }
        ]);
      }
      firstTaskNoteLoads += 1;
      return Promise.resolve(
        firstTaskNoteLoads === 1
          ? []
          : [
              {
                id: "stale-note-a",
                projectId: "p1",
                taskId: "t1",
                body: "Stale task A context",
                createdAt: "2026-05-20T10:00:00Z"
              }
            ]
      );
    });
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);
    listLinkedCommitsForTask.mockImplementation((_projectId, taskId) =>
      Promise.resolve(
        taskId === "t1"
          ? [
              {
                sha: "abc123",
                projectId: "p1",
                branch: "main",
                message: "Fix import",
                authorName: "Clyde",
                committedAt: "2026-05-20T10:00:00Z",
                changedFiles: []
              }
            ]
          : []
      )
    );
    unlinkCommit.mockReturnValue(pendingUnlink.promise);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      await screen.findByRole("button", { name: "Remove abc123 from task" })
    );
    await user.click(screen.getByRole("button", { name: "Plan" }));
    await user.click(await screen.findByRole("button", { name: "Open Second task" }));

    expect(await screen.findByText("Task B context")).toBeInTheDocument();

    await act(async () => {
      pendingUnlink.resolve();
      await pendingUnlink.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Second task" })).toBeInTheDocument();
      expect(screen.getByText("Task B context")).toBeInTheDocument();
      expect(screen.queryByText("Stale task A context")).not.toBeInTheDocument();
    });
    expect(firstTaskNoteLoads).toBe(1);
  });

  it("does not reload stale task context after a deferred commit move", async () => {
    const user = userEvent.setup();
    const pendingMove = deferred<void>();
    let firstTaskNoteLoads = 0;
    const plan = twoTaskPlanFixture({ firstStatus: "active", secondStatus: "done" });
    plan.tasks[0] = { ...plan.tasks[0], nextStep: "Continue testing" };
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: true })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      nextStep: ""
    });
    loadProjectPlan.mockResolvedValue(plan);
    syncGitCommits.mockResolvedValue([]);
    listNotesForTask.mockImplementation((_projectId, taskId) => {
      if (taskId === "t2") {
        return Promise.resolve([
          {
            id: "note-b",
            projectId: "p1",
            taskId: "t2",
            body: "Task B move context",
            createdAt: "2026-05-20T10:00:00Z"
          }
        ]);
      }
      firstTaskNoteLoads += 1;
      return Promise.resolve(
        firstTaskNoteLoads === 1
          ? []
          : [
              {
                id: "stale-move-note-a",
                projectId: "p1",
                taskId: "t1",
                body: "Stale moved task A context",
                createdAt: "2026-05-20T10:00:00Z"
              }
            ]
      );
    });
    listWorkEntriesForTask.mockResolvedValue([]);
    listInboxItemsForTask.mockResolvedValue([]);
    listInboxItemsForProject.mockResolvedValue([]);
    listLinkedCommitsForTask.mockImplementation((_projectId, taskId) =>
      Promise.resolve(
        taskId === "t1"
          ? [
              {
                sha: "abc123",
                projectId: "p1",
                branch: "main",
                message: "Move import",
                authorName: "Clyde",
                committedAt: "2026-05-20T10:00:00Z",
                changedFiles: []
              }
            ]
          : []
      )
    );
    moveCommitLink.mockReturnValue(pendingMove.promise);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(
      await screen.findByRole("button", { name: "Show commit details for abc123" })
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Move abc123 to task" }),
      "t2"
    );
    await user.click(screen.getByRole("button", { name: "Move abc123 to task" }));
    await user.click(screen.getByRole("button", { name: "Plan" }));
    await user.click(await screen.findByRole("button", { name: "Open Second task" }));

    expect(await screen.findByText("Task B move context")).toBeInTheDocument();

    await act(async () => {
      pendingMove.resolve();
      await pendingMove.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Second task" })).toBeInTheDocument();
      expect(screen.getByText("Task B move context")).toBeInTheDocument();
      expect(screen.queryByText("Stale moved task A context")).not.toBeInTheDocument();
    });
    expect(firstTaskNoteLoads).toBe(1);
  });

  it("chooses folders for portable export and import", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/backups")
      .mockResolvedValueOnce("/tmp/desclop");
    choosePortableBackupFileMock.mockResolvedValue("/tmp/backups/desclop.desclop");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

    expect(screen.getByLabelText("Destination folder")).toHaveValue("/tmp/backups");
    expect(screen.getByLabelText("Backup file")).toHaveValue("/tmp/backups/desclop.desclop");
    expect(screen.getByLabelText("Local project folder")).toHaveValue("/tmp/desclop");
  });

  it("restores a backup from first run without creating a blank project", async () => {
    const user = userEvent.setup();
    const restoredProject = projectFixture({
      id: "restored-project",
      name: "Restored project",
      localPath: "/tmp/restored-project"
    });
    enableTauriApi();
    listProjects
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([restoredProject]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief("restored-project"));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("restored-project"));
    choosePortableBackupFileMock.mockResolvedValue("/tmp/backups/Restored.desclop");
    chooseFolderMock.mockResolvedValue("/tmp/restored-project");
    importProjectBundle.mockResolvedValue("restored-project");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Restore a backup" }));
    expect(screen.getByRole("heading", { name: "Restore a backup" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Review portable restore" }));
    await user.click(await screen.findByRole("button", { name: "Confirm restore" }));

    expect(importProjectBundle).toHaveBeenCalledWith(
      "/tmp/backups/Restored.desclop",
      "/tmp/restored-project",
      true
    );
    expect(createProject).not.toHaveBeenCalled();
    expect(await screen.findByText("Backup restored")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Application" })).toHaveTextContent(
      "Restored project"
    );
  });

  it("offers restore directly from the saved-project picker", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Switch project" }));
    await user.click(screen.getByRole("button", { name: "Restore a backup" }));

    expect(screen.getByRole("heading", { name: "Restore a backup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose backup file" })).toBeInTheDocument();
  });

  it("ignores a folder selection that finishes after switching projects", async () => {
    const user = userEvent.setup();
    let resolveFolderSelection: (path: string) => void = () => {};
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    enableTauriApi();
    listProjects.mockResolvedValue([firstProject, secondProject]);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockImplementation(async (projectId) => importedPlanFixture(projectId));
    chooseFolderMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFolderSelection = resolve;
      })
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    );
    await user.click(await screen.findByRole("button", { name: "Backups" }));

    await act(async () => {
      resolveFolderSelection("/tmp/stale-backups");
    });

    expect(screen.getByLabelText("Destination folder")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
  });

  it("shows a folder picker error without changing the selected path", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    chooseFolderMock.mockRejectedValue(new Error("dialog unavailable"));

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not open folder picker."
    );
    expect(screen.getByLabelText("Destination folder")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
  });

  it("requires confirmation before relinking a project folder and preserves the project identity", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    chooseFolderMock.mockResolvedValue("/tmp/relinked-project");
    relinkProjectFolder.mockResolvedValue(
      projectFixture({ localPath: "/tmp/relinked-project" })
    );

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose new folder" }));

    expect(
      await screen.findByRole("dialog", { name: "Confirm project folder relink" })
    ).toBeInTheDocument();
    expect(relinkProjectFolder).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm relink" }));

    expect(relinkProjectFolder).toHaveBeenCalledWith("p1", "/tmp/relinked-project");
    expect(await screen.findByText("Project folder reconnected")).toBeInTheDocument();
  });

  it("exports and imports portable backups with visible feedback", async () => {
    const user = userEvent.setup();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const importedProject = projectFixture({
      id: "p2",
      name: "Imported Project",
      localPath: "/tmp/desclop"
    });
    enableTauriApi();
    listProjects
      .mockResolvedValueOnce([projectFixture()])
      .mockResolvedValueOnce([projectFixture(), importedProject]);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    exportProjectBundle.mockResolvedValue(portableExportResult("/tmp/backups/desclop.desclop"));
    importProjectBundle.mockResolvedValue("p2");
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/backups")
      .mockResolvedValueOnce("/tmp/desclop");
    choosePortableBackupFileMock.mockResolvedValue("/tmp/backups/desclop.desclop");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Export portable backup" }));

    expect(exportProjectBundle).toHaveBeenCalledWith("p1", "/tmp/backups");
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("status")
          .some((status) =>
            status.textContent?.includes("Backup saved")
          )
      ).toBe(true);
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500);
    setTimeoutSpy.mockRestore();

    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Review portable restore" }));
    expect(inspectProjectBundle).toHaveBeenCalledWith("/tmp/backups/desclop.desclop");
    expect(importProjectBundle).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "Confirm portable backup restore" })
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Confirm restore" }));

    expect(importProjectBundle).toHaveBeenCalledWith("/tmp/backups/desclop.desclop", "/tmp/desclop", true);
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("status")
          .some((status) => status.textContent?.includes("Backup restored"))
      ).toBe(true);
    });
  });

  it("opens readable markdown export and runs portable bundle export/import commands", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    const importedProject = projectFixture({ id: "p2", name: "Imported Project" });
    listProjects
      .mockResolvedValueOnce([projectFixture({ id: "p1", name: "Desclop" })])
      .mockResolvedValueOnce([projectFixture({ id: "p1", name: "Desclop" }), importedProject]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief("p1"));
    loadProjectPlan
      .mockResolvedValueOnce(importedPlanFixture("p1"))
      .mockResolvedValueOnce({
        stages: [
          {
            id: "s2",
            projectId: "p2",
            title: "Imported stage",
            description: "",
            position: 0,
            status: "current"
          }
        ],
        tasks: [],
        checklistItems: []
      });
    exportProjectBundle.mockResolvedValue(
      portableExportResult("/tmp/desclop-bundle/Desclop.desclop")
    );
    importProjectBundle.mockResolvedValue("p2");
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/desclop-bundle")
      .mockResolvedValueOnce("/tmp/desclop-imported");
    choosePortableBackupFileMock.mockResolvedValue("/tmp/desclop-bundle/Desclop.desclop");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    const markdownExportDetails = screen.getByText("Build MVP").closest("details");
    expect(markdownExportDetails).not.toHaveAttribute("open");
    await user.click(screen.getByText("Build MVP"));
    expect(markdownExportDetails).toHaveAttribute("open");
    const markdownExport = screen.getByLabelText("Build MVP Markdown preview") as HTMLTextAreaElement;
    expect(markdownExport.value).toContain("## Foundation");
    expect(markdownExport.value).toContain("  - [x] Add migration");

    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Export portable backup" }));

    expect(exportProjectBundle).toHaveBeenCalledWith("p1", "/tmp/desclop-bundle");
    expect(await screen.findByText("Backup saved")).toBeInTheDocument();
    expect(
      screen.getByText("A portable .desclop backup and matching README were created.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Review portable restore" }));
    await user.click(await screen.findByRole("button", { name: "Confirm restore" }));

    expect(importProjectBundle).toHaveBeenCalledWith(
      "/tmp/desclop-bundle/Desclop.desclop",
      "/tmp/desclop-imported",
      true
    );
    expect(await screen.findByText("Backup restored")).toBeInTheDocument();
    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenLastCalledWith("p2");
    });
    await user.click(screen.getByRole("button", { name: "Backups" }));
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Project plan Markdown preview") as HTMLTextAreaElement).value
      ).toContain("# Imported Project Plan");
    });
  });

  it("previews, edits, excludes, and manually copies local AI context", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    enableTauriApi();
    const plan = importedPlanFixture("p1");
    plan.tasks[0] = {
      ...plan.tasks[0],
      nextStep: "Run the context export test."
    };
    listProjects.mockResolvedValue([
      projectFixture({ id: "p1", activeTaskId: "t1", gitEnabled: true })
    ]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief("p1"));
    loadProjectPlan.mockResolvedValue(plan);
    syncGitCommits.mockResolvedValue([]);
    listNotesForTask.mockResolvedValue([
      {
        id: "note-1",
        projectId: "p1",
        taskId: "t1",
        body: "Keep this note visible before copying.",
        createdAt: "2026-07-25T00:00:00Z"
      }
    ]);
    listWorkEntriesForTask.mockResolvedValue([
      {
        id: "work-1",
        projectId: "p1",
        taskId: "t1",
        source: "manual",
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Added the local preview.",
        remains: "Check copy output.",
        nextStep: "Copy once reviewed.",
        createdAt: "2026-07-26T00:00:00Z"
      }
    ]);
    listLinkedCommitsForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    const contextExportDisclosure = screen
      .getByText("Manual AI context export")
      .closest("details");
    expect(contextExportDisclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("Manual AI context export"));
    expect(screen.getByRole("heading", { name: "Review and copy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Plan preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Task preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Next action preview")).toHaveValue(
      "Run the context export test."
    );
    expect(writeText).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Include Notes" }));
    await user.clear(screen.getByLabelText("Next action preview"));
    await user.type(screen.getByLabelText("Next action preview"), "Use the reviewed action.");

    const preview = screen.getByLabelText("Full Markdown preview") as HTMLTextAreaElement;
    expect(preview.value).toContain("Use the reviewed action.");
    expect(preview.value).not.toContain("## Notes");
    await user.click(within(contextExportDisclosure as HTMLElement).getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(preview.value);
  });

  it("does not reopen a portable import that finishes after closing its project", async () => {
    const user = userEvent.setup();
    let resolvePortableImport: (projectId: string) => void = () => {};
    const firstProject = projectFixture({ id: "p1", name: "First Project" });
    const secondProject = projectFixture({
      id: "p2",
      name: "Second Project",
      localPath: "/tmp/second-project"
    });
    const importedProject = projectFixture({
      id: "p3",
      name: "Imported Project",
      localPath: "/tmp/imported-project"
    });
    enableTauriApi();
    listProjects
      .mockResolvedValueOnce([firstProject, secondProject])
      .mockResolvedValueOnce([firstProject, secondProject, importedProject]);
    getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
    loadProjectPlan.mockResolvedValue({ stages: [], tasks: [], checklistItems: [] });
    importProjectBundle.mockReturnValue(
      new Promise((resolve) => {
        resolvePortableImport = resolve;
      })
    );
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/imported-project");
    choosePortableBackupFileMock.mockResolvedValue("/tmp/desclop-bundle/Imported.desclop");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Review portable restore" }));
    await user.click(await screen.findByRole("button", { name: "Confirm restore" }));
    await waitFor(() => {
      expect(importProjectBundle).toHaveBeenCalledWith(
        "/tmp/desclop-bundle/Imported.desclop",
        "/tmp/imported-project",
        true
      );
    });

    await user.click(screen.getByRole("button", { name: "Switch project" }));
    await user.click(
      screen.getByRole("button", { name: /Second Project.*Open project/s })
    );

    await act(async () => {
      resolvePortableImport("p3");
    });

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Application" })).toHaveTextContent(
        "Second Project"
      );
    });
    expect(screen.queryByText("Imported Project")).not.toBeInTheDocument();
  });

  it("opens Timeline with task notes and work facts", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      latestNote: "Schema note",
      nextStep: "Run cargo test"
    });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    const notes = [
      {
        id: "n1",
        projectId: "p1",
        taskId: "t1",
        body: "Schema note",
        createdAt: "2026-05-20T10:00:00Z"
      }
    ];
    const workEntries = [
      {
        id: "w1",
        projectId: "p1",
        taskId: "t1",
        source: "manual" as const,
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Reviewed schema",
        remains: "Run backend tests",
        nextStep: "Run cargo test",
        createdAt: "2026-05-20T10:01:30Z"
      }
    ];
    listNotesForTask.mockResolvedValue(notes);
    listWorkEntriesForTask.mockResolvedValue(workEntries);
    listNotesForProject.mockResolvedValue(notes);
    listWorkEntriesForProject.mockResolvedValue(workEntries);
    listInboxItemsForProject.mockResolvedValue([]);
    listLinkedCommitsForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Timeline" }));

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("0 commits · 1 work review · 1 note")).toBeInTheDocument();
    expect(screen.getByText("Reviewed schema")).toBeInTheDocument();
    expect(screen.getByText("Schema note")).toBeInTheDocument();
  });

  it("opens Timeline directly from Today with project history", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ activeTaskId: "t1", gitEnabled: false })]);
    getResumeBrief.mockResolvedValue({
      ...emptyResumeBrief(),
      taskId: "t1",
      stageId: "s1",
      latestNote: "Schema note",
      nextStep: "Run cargo test"
    });
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    listNotesForProject.mockResolvedValue([
      {
        id: "n1",
        projectId: "p1",
        taskId: "t1",
        body: "Schema note",
        createdAt: "2026-05-20T10:00:00Z"
      }
    ]);
    listWorkEntriesForProject.mockResolvedValue([
      {
        id: "w1",
        projectId: "p1",
        taskId: "t1",
        source: "manual" as const,
        startedAt: null,
        endedAt: null,
        durationSeconds: null,
        done: "Reviewed schema",
        remains: "Run backend tests",
        nextStep: "Run cargo test",
        createdAt: "2026-05-20T10:01:30Z"
      }
    ]);
    listInboxItemsForProject.mockResolvedValue([
      {
        id: "i1",
        projectId: "p1",
        taskId: null,
        body: "Check export path",
        kind: "question",
        status: "open",
        createdAt: "2026-05-20T10:02:00Z",
        updatedAt: "2026-05-20T10:02:00Z"
      }
    ]);

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Timeline" }));

    expect(listNotesForProject).toHaveBeenCalledWith("p1");
    expect(listWorkEntriesForProject).toHaveBeenCalledWith("p1");
    expect(listInboxItemsForProject).toHaveBeenCalledWith("p1");
    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("0 commits · 1 work review · 2 notes")).toBeInTheDocument();
    expect(screen.getByText("Reviewed schema")).toBeInTheDocument();
    expect(screen.getByText("Schema note")).toBeInTheDocument();
    expect(screen.getByText("Check export path")).toBeInTheDocument();
  });

  it("shows create errors without leaving the setup flow", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([]);
    createProject.mockRejectedValue(new Error("cannot create"));

    renderWithRouter(<App />);

    await user.type(await screen.findByLabelText("Project name"), "Broken Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/broken");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create project.");
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Create a local project" })).toBeInTheDocument();
  });

  it("shows a human-readable folder validation error before creating a project", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([]);
    inspectProjectFolder.mockRejectedValue(new Error("The selected path is not a folder."));

    renderWithRouter(<App />);

    await user.type(await screen.findByLabelText("Project name"), "File Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/not-a-folder");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("The selected path is not a folder.")).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Create a local project" })).toBeInTheDocument();
  });

  it("shows a load error when project creation succeeds but plan loading fails", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([]);
    createProject.mockResolvedValue({
      id: "p1",
      name: "Created Project",
      localPath: "/tmp/created",
      gitEnabled: false,
      gitRemote: null,
      activeTaskId: null,
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });
    getResumeBrief.mockResolvedValue({
      id: "rb1",
      projectId: "p1",
      taskId: null,
      stageId: null,
      latestNote: "",
      nextStep: "Choose the next concrete step before you stop.",
      facts: [],
      generatedAt: "2026-05-20T10:00:00Z"
    });
    loadProjectPlan.mockRejectedValue(new Error("plan unavailable"));

    renderWithRouter(<App />);

    await user.type(await screen.findByLabelText("Project name"), "Created Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/created");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load project plan.");
    expect(screen.queryByRole("heading", { name: "Continue where you left off" })).not.toBeInTheDocument();
    expect(screen.queryByText("Could not create project.")).not.toBeInTheDocument();
  });

  it("prevents duplicate create submissions while creation is pending", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([]);
    createProject.mockReturnValue(new Promise(() => undefined));

    renderWithRouter(<App />);

    await user.type(await screen.findByLabelText("Project name"), "Pending Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/pending");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    await user.click(screen.getByRole("button", { name: "Creating project" }));

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Creating project" })).toBeDisabled();
  });
});

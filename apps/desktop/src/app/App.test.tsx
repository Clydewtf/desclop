import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";
import { api } from "../shared/api/client";
import { chooseFolder } from "../shared/api/folderDialog";
import type { ResumeBrief } from "../shared/domain/types";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    listProjectSummaries: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getResumeBrief: vi.fn(),
    loadProjectPlan: vi.fn(),
    importPlan: vi.fn(),
    updateTaskStatus: vi.fn(),
    setActiveTask: vi.fn(),
    updateChecklistItem: vi.fn(),
    addNote: vi.fn(),
    updateNextStep: vi.fn(),
    createWorkEntry: vi.fn(),
    captureInboxItem: vi.fn(),
    attachInboxItemToTask: vi.fn(),
    listInboxItemsForProject: vi.fn(),
    listInboxItemsForTask: vi.fn(),
    listNotesForProject: vi.fn(),
    listNotesForTask: vi.fn(),
    listWorkEntriesForProject: vi.fn(),
    listWorkEntriesForTask: vi.fn(),
    readGitCommits: vi.fn(),
    syncGitCommits: vi.fn(),
    listLinkedCommitsForTask: vi.fn(),
    moveCommitLink: vi.fn(),
    unlinkCommit: vi.fn(),
    exportProjectBundle: vi.fn(),
    importProjectBundle: vi.fn()
  }
}));

vi.mock("../shared/api/folderDialog", () => ({
  chooseFolder: vi.fn()
}));

const listProjects = vi.mocked(api.listProjects);
const listProjectSummaries = vi.mocked(api.listProjectSummaries);
const createProject = vi.mocked(api.createProject);
const deleteProject = vi.mocked(api.deleteProject);
const getResumeBrief = vi.mocked(api.getResumeBrief);
const loadProjectPlan = vi.mocked(api.loadProjectPlan);
const importPlan = vi.mocked(api.importPlan);
const createWorkEntry = vi.mocked(api.createWorkEntry);
const captureInboxItem = vi.mocked(api.captureInboxItem);
const attachInboxItemToTask = vi.mocked(api.attachInboxItemToTask);
const listInboxItemsForProject = vi.mocked(api.listInboxItemsForProject);
const listInboxItemsForTask = vi.mocked(api.listInboxItemsForTask);
const updateChecklistItem = vi.mocked(api.updateChecklistItem);
const updateNextStep = vi.mocked(api.updateNextStep);
const setActiveTask = vi.mocked(api.setActiveTask);
const addNote = vi.mocked(api.addNote);
const listNotesForProject = vi.mocked(api.listNotesForProject);
const listNotesForTask = vi.mocked(api.listNotesForTask);
const listWorkEntriesForProject = vi.mocked(api.listWorkEntriesForProject);
const listWorkEntriesForTask = vi.mocked(api.listWorkEntriesForTask);
const syncGitCommits = vi.mocked(api.syncGitCommits);
const listLinkedCommitsForTask = vi.mocked(api.listLinkedCommitsForTask);
const moveCommitLink = vi.mocked(api.moveCommitLink);
const unlinkCommit = vi.mocked(api.unlinkCommit);
const exportProjectBundle = vi.mocked(api.exportProjectBundle);
const importProjectBundle = vi.mocked(api.importProjectBundle);
const chooseFolderMock = vi.mocked(chooseFolder);

function enableTauriApi() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true
  });
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

function resumeBriefFixture(overrides: Partial<ReturnType<typeof emptyResumeBrief>> = {}) {
  return {
    ...emptyResumeBrief(overrides.projectId ?? "p1"),
    ...overrides
  };
}

function importedPlanFixture(projectId: string) {
  return {
    stages: [
      {
        id: "s1",
        projectId,
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
    stages: [
      {
        id: `${projectId}-stage`,
        projectId,
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
    stages: [
      {
        id: "s1",
        projectId: "p1",
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
  listProjectSummaries.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  chooseFolderMock.mockReset();
  vi.clearAllMocks();
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("App", () => {
  it("renders the desktop shell", () => {
    renderWithRouter(<App />);
    expect(screen.getByText("Desclop")).toBeInTheDocument();
  });

  it("renders a calm loading state inside the shell", () => {
    enableTauriApi();
    listProjects.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<App />);

    expect(screen.getByRole("heading", { name: "Opening Desclop" })).toBeInTheDocument();
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
      facts: ["1 recent commit on main"],
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
    expect(screen.getByText("1 recent commit on main")).toBeInTheDocument();
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

  it("orders Next up by stage and task position while excluding current and done tasks", async () => {
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

    const nextUp = await screen.findByLabelText("Next up");
    expect(within(nextUp).getAllByRole("strong").map((item) => item.textContent)).toEqual([
      "First stage first",
      "First stage later",
      "Second stage later"
    ]);
    expect(within(nextUp).queryByText("Current task")).not.toBeInTheDocument();
    expect(within(nextUp).queryByText("Completed task")).not.toBeInTheDocument();
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
      target: { value: "## Foundation\n- [ ] Create local store\n  - [x] Add migration" }
    });
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await user.click(screen.getByRole("button", { name: "Import plan" }));

    expect(importPlan).toHaveBeenCalledWith("p1", [
      {
        title: "Foundation",
        description: "",
        position: 0,
        tasks: [
          {
            title: "Create local store",
            status: "todo",
            position: 0,
            checklist: [{ title: "Add migration", completed: true, position: 0 }]
          }
        ]
      }
    ]);
    expect(await screen.findByRole("heading", { name: "Foundation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue Create local store" })).toBeEnabled();
  });

  it("navigates to Timeline and Utilities from the shell", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: false })]);
    getResumeBrief.mockResolvedValue(
      resumeBriefFixture({ facts: ["1 recent commit on main"] })
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

  it("shows Timeline git events even when resume facts are unavailable", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: true })]);
    getResumeBrief.mockResolvedValue(resumeBriefFixture({ facts: [] }));
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
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
    await user.click(screen.getByRole("button", { name: "Set next step" }));

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
    await user.click(screen.getByRole("button", { name: "Import plan" }));

    expect(screen.getByRole("button", { name: "Importing plan" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Importing plan" }));
    expect(importPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveImport();
    });
  });

  it("shows destructive re-import errors inline without clearing the draft", async () => {
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
    await user.click(screen.getByRole("button", { name: "Import plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not import plan without losing existing task history."
    );
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
    expect(screen.getByRole("button", { name: "Finish focus session" })).toBeInTheDocument();
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
    await user.clear(screen.getByLabelText("Next step"));
    await user.type(screen.getByLabelText("Next step"), "Review updated spec");
    await user.click(screen.getByRole("button", { name: "Save next step" }));
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

  it("captures inbox items from Today", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture({ gitEnabled: false })]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    captureInboxItem.mockResolvedValue({
      id: "i1",
      projectId: "p1",
      taskId: null,
      body: "Check export shape",
      kind: "question",
      status: "open",
      createdAt: "2026-05-20T10:00:00Z",
      updatedAt: "2026-05-20T10:00:00Z"
    });

    renderWithRouter(<App />);

    const captureInput = await screen.findByLabelText("Capture");
    await user.type(captureInput, "Check export shape");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(
      within(captureInput.closest("form") as HTMLElement).getByRole("button", { name: "Capture" })
    );

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Check export shape",
      kind: "question"
    });
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

    const captureInput = await screen.findByLabelText("Capture");
    await user.type(captureInput, "Check narrow desktop layout");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(
      within(captureInput.closest("form") as HTMLElement).getByRole("button", { name: "Capture" })
    );
    await user.click(screen.getByRole("button", { name: "Continue task" }));

    expect(await screen.findByText("1 inbox items")).toBeInTheDocument();
    expect(screen.getByText("Check narrow desktop layout")).toBeInTheDocument();
  });

  it("captures inbox items from Task Detail", async () => {
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

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    expect(await screen.findByText("Attached inbox context")).toBeInTheDocument();
    const captureInput = screen.getByLabelText("Capture");
    await user.type(captureInput, "Check task export shape");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(
      within(captureInput.closest("form") as HTMLElement).getByRole("button", { name: "Capture" })
    );

    expect(captureInboxItem).toHaveBeenCalledWith({
      projectId: "p1",
      body: "Check task export shape",
      kind: "question"
    });
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
    await user.click(screen.getByRole("button", { name: "Add manual work review" }));
    await user.type(screen.getByLabelText("What was done"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains"), "Run backend tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

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
    await user.click(screen.getByRole("button", { name: "Add manual work review" }));
    await user.type(screen.getByLabelText("What was done"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains"), "Run backend tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

    expect(await screen.findByText("1 work entries")).toBeInTheDocument();
    expect(screen.queryByText("2 work entries")).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText("What was done"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains"), "Run backend tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

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
    await user.click(screen.getByRole("button", { name: "Finish focus session" }));
    await user.type(screen.getByLabelText("What was done"), "Reviewed alpha flow");
    await user.type(screen.getByLabelText("What remains"), "Run browser screenshots");
    await user.type(screen.getByLabelText("Next step"), "Capture final screenshots");
    await user.click(screen.getByRole("button", { name: "Save work review" }));
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
    fireEvent.change(screen.getByLabelText("Quick note"), {
      target: { value: "Keep this focus note" }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finish focus session" }));
    });
    vi.useRealTimers();
    expect(screen.getByLabelText("What was done")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What was done"), "Added migration");
    await user.type(screen.getByLabelText("What remains"), "Repository tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

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
      expect(screen.getByLabelText("Next step")).toHaveValue("Run cargo test");
    });
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

  it("starts timebox focus and captures inbox items through the API", async () => {
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
    await user.clear(screen.getByLabelText("Timebox minutes"));
    await user.type(screen.getByLabelText("Timebox minutes"), "5");
    await user.click(screen.getByRole("button", { name: "Start timebox" }));

    expect(screen.getByText("05:00 remaining")).toBeInTheDocument();

    const captureInput = screen.getByLabelText("Capture");
    await user.type(captureInput, "Remember repository tests");
    await user.selectOptions(screen.getByLabelText("Capture type"), "note");
    await user.click(
      within(captureInput.closest("form") as HTMLElement).getByRole("button", { name: "Capture" })
    );

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

    expect(await screen.findByRole("status")).toHaveTextContent("Git unavailable.");
    expect(syncGitCommits).toHaveBeenCalledWith("p1");
    expect(syncGitCommits).not.toHaveBeenCalledWith("p1", "/tmp/desclop");
    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue task" })).toBeEnabled();

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

    expect(await screen.findByText("2 recent commits on main")).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Unlink abc123" }));

    expect(unlinkCommit).toHaveBeenCalledWith("abc123", "t1");
    await waitFor(() => {
      expect(listLinkedCommitsForTask).toHaveBeenLastCalledWith("p1", "t1");
    });
    expect(await screen.findByText("0 linked commits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.selectOptions(await screen.findByLabelText("Move def456 to task"), "t2");
    await user.click(screen.getByRole("button", { name: "Move def456" }));

    expect(moveCommitLink).toHaveBeenCalledWith("def456", "t1", "t2");
    await waitFor(() => {
      expect(listLinkedCommitsForTask).toHaveBeenLastCalledWith("p1", "t1");
    });
  });

  it("chooses folders for portable export and import", async () => {
    const user = userEvent.setup();
    enableTauriApi();
    listProjects.mockResolvedValue([projectFixture()]);
    getResumeBrief.mockResolvedValue(emptyResumeBrief());
    loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/backups")
      .mockResolvedValueOnce("/tmp/backups/desclop")
      .mockResolvedValueOnce("/tmp/desclop");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

    expect(screen.getByLabelText("Destination folder")).toHaveValue("/tmp/backups");
    expect(screen.getByLabelText("Backup folder")).toHaveValue("/tmp/backups/desclop");
    expect(screen.getByLabelText("Local project folder")).toHaveValue("/tmp/desclop");
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

  it("exports and imports portable backups with visible feedback", async () => {
    const user = userEvent.setup();
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
    exportProjectBundle.mockResolvedValue("/tmp/backups/desclop");
    importProjectBundle.mockResolvedValue("p2");
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/backups")
      .mockResolvedValueOnce("/tmp/backups/desclop")
      .mockResolvedValueOnce("/tmp/desclop");

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
            status.textContent?.includes(
              "Exported portable backup to /tmp/backups/desclop"
            )
          )
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Import portable backup" }));

    expect(importProjectBundle).toHaveBeenCalledWith("/tmp/backups/desclop", "/tmp/desclop");
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("status")
          .some((status) => status.textContent?.includes("Imported portable project."))
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
    exportProjectBundle.mockResolvedValue("/tmp/desclop-bundle/Desclop.desclop");
    importProjectBundle.mockResolvedValue("p2");
    chooseFolderMock
      .mockResolvedValueOnce("/tmp/desclop-bundle")
      .mockResolvedValueOnce("/tmp/desclop-bundle/Desclop.desclop")
      .mockResolvedValueOnce("/tmp/desclop-imported");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    const markdownExport = screen.getByLabelText("Markdown preview") as HTMLTextAreaElement;
    expect(markdownExport.value).toContain("## Foundation");
    expect(markdownExport.value).toContain("  - [x] Add migration");

    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Export portable backup" }));

    expect(exportProjectBundle).toHaveBeenCalledWith("p1", "/tmp/desclop-bundle");
    expect(
      await screen.findByText(
        "Exported portable backup to /tmp/desclop-bundle/Desclop.desclop"
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Import portable backup" }));

    expect(importProjectBundle).toHaveBeenCalledWith(
      "/tmp/desclop-bundle/Desclop.desclop",
      "/tmp/desclop-imported"
    );
    expect(await screen.findByText("Imported portable project.")).toBeInTheDocument();
    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenLastCalledWith("p2");
    });
    await waitFor(() => {
      expect((screen.getByLabelText("Markdown preview") as HTMLTextAreaElement).value).toContain(
        "# Imported Project Plan"
      );
    });
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
      .mockResolvedValueOnce("/tmp/desclop-bundle/Imported.desclop")
      .mockResolvedValueOnce("/tmp/imported-project");

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Backups" }));
    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
    await user.click(screen.getByRole("button", { name: "Import portable backup" }));
    await waitFor(() => {
      expect(importProjectBundle).toHaveBeenCalledWith(
        "/tmp/desclop-bundle/Imported.desclop",
        "/tmp/imported-project"
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

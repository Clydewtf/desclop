import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";
import { api } from "../shared/api/client";
import type { ResumeBrief } from "../shared/domain/types";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
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

const listProjects = vi.mocked(api.listProjects);
const createProject = vi.mocked(api.createProject);
const getResumeBrief = vi.mocked(api.getResumeBrief);
const loadProjectPlan = vi.mocked(api.loadProjectPlan);
const importPlan = vi.mocked(api.importPlan);
const createWorkEntry = vi.mocked(api.createWorkEntry);
const captureInboxItem = vi.mocked(api.captureInboxItem);
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

afterEach(() => {
  vi.useRealTimers();
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
    expect(screen.getByText("0 work entries, 0 commits, 0 notes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export / Import" }));
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
    expect(screen.getByText("0 work entries, 1 commit, 0 notes")).toBeInTheDocument();
    expect(screen.getByText("Add timeline screen")).toBeInTheDocument();
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
    expect(within(nav).getByRole("button", { name: "Export / Import" })).toBeInTheDocument();

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

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Export / Import" }));

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    const markdownExport = screen.getByLabelText("Markdown export") as HTMLTextAreaElement;
    expect(markdownExport.value).toContain("## Foundation");
    expect(markdownExport.value).toContain("  - [x] Add migration");

    await user.type(screen.getByLabelText("Bundle destination folder"), "/tmp/desclop-bundle");
    await user.click(screen.getByRole("button", { name: "Export portable bundle" }));

    expect(exportProjectBundle).toHaveBeenCalledWith("p1", "/tmp/desclop-bundle");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Exported portable bundle to /tmp/desclop-bundle/Desclop.desclop"
    );

    await user.type(screen.getByLabelText("Bundle folder"), "/tmp/desclop-bundle/Desclop.desclop");
    await user.type(screen.getByLabelText("Reselected local folder path"), "/tmp/desclop-imported");
    await user.click(screen.getByRole("button", { name: "Import portable bundle" }));

    expect(importProjectBundle).toHaveBeenCalledWith(
      "/tmp/desclop-bundle/Desclop.desclop",
      "/tmp/desclop-imported"
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Imported portable project.");
    await waitFor(() => {
      expect(loadProjectPlan).toHaveBeenLastCalledWith("p2");
    });
    await waitFor(() => {
      expect((screen.getByLabelText("Markdown export") as HTMLTextAreaElement).value).toContain(
        "# Imported Project Plan"
      );
    });
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
    expect(screen.getByText("1 work entry, 0 commits, 1 note")).toBeInTheDocument();
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
    expect(screen.getByText("1 work entry, 0 commits, 1 note")).toBeInTheDocument();
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

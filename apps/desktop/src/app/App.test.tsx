import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";
import { api } from "../shared/api/client";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getResumeBrief: vi.fn(),
    loadProjectPlan: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateChecklistItem: vi.fn(),
    addNote: vi.fn(),
    updateNextStep: vi.fn(),
    createWorkEntry: vi.fn(),
    captureInboxItem: vi.fn(),
    listNotesForTask: vi.fn(),
    listWorkEntriesForTask: vi.fn(),
    readGitCommits: vi.fn()
  }
}));

const listProjects = vi.mocked(api.listProjects);
const createProject = vi.mocked(api.createProject);
const getResumeBrief = vi.mocked(api.getResumeBrief);
const loadProjectPlan = vi.mocked(api.loadProjectPlan);
const createWorkEntry = vi.mocked(api.createWorkEntry);
const captureInboxItem = vi.mocked(api.captureInboxItem);
const addNote = vi.mocked(api.addNote);
const listNotesForTask = vi.mocked(api.listNotesForTask);
const listWorkEntriesForTask = vi.mocked(api.listWorkEntriesForTask);
const readGitCommits = vi.mocked(api.readGitCommits);

function enableTauriApi() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true
  });
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

  it("shows a recoverable error when project loading fails", async () => {
    enableTauriApi();
    listProjects.mockRejectedValue(new Error("database unavailable"));

    renderWithRouter(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load projects.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Start ambient focus" }));
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
    await user.click(screen.getByRole("button", { name: "Start timebox focus" }));

    expect(screen.getByText("05:00 remaining")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Capture"), "Remember repository tests");
    await user.selectOptions(screen.getByLabelText("Capture type"), "note");
    await user.click(screen.getByRole("button", { name: "Capture" }));

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
    readGitCommits.mockRejectedValue(new Error("not a git repository"));
    listNotesForTask.mockResolvedValue([]);
    listWorkEntriesForTask.mockResolvedValue([]);

    renderWithRouter(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent("Git unavailable.");
    expect(readGitCommits).toHaveBeenCalledWith("/tmp/desclop");
    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue task" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Continue task" }));

    expect(await screen.findByRole("button", { name: "Start ambient focus" })).toBeInTheDocument();
    expect(screen.getByText("0 linked commits")).toBeInTheDocument();
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

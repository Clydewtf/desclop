import { screen } from "@testing-library/react";
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
    listNotesForTask: vi.fn(),
    listWorkEntriesForTask: vi.fn()
  }
}));

const listProjects = vi.mocked(api.listProjects);
const createProject = vi.mocked(api.createProject);
const getResumeBrief = vi.mocked(api.getResumeBrief);
const loadProjectPlan = vi.mocked(api.loadProjectPlan);
const createWorkEntry = vi.mocked(api.createWorkEntry);
const listNotesForTask = vi.mocked(api.listNotesForTask);
const listWorkEntriesForTask = vi.mocked(api.listWorkEntriesForTask);

function enableTauriApi() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true
  });
}

afterEach(() => {
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
    createWorkEntry.mockResolvedValue({
      id: "w1",
      projectId: "p1",
      taskId: "t1",
      source: "focus",
      startedAt: "2026-05-20T10:00:00Z",
      endedAt: "2026-05-20T10:01:00Z",
      durationSeconds: 60,
      done: "Added migration",
      remains: "Repository tests",
      nextStep: "Run cargo test",
      createdAt: "2026-05-20T10:01:00Z"
    });

    renderWithRouter(<App />);

    await user.click(await screen.findByRole("button", { name: "Continue task" }));
    await user.click(screen.getByRole("button", { name: "Start Focus Mode" }));
    await user.click(screen.getByRole("button", { name: "Finish focus session" }));
    await user.type(screen.getByLabelText("What was done"), "Added migration");
    await user.type(screen.getByLabelText("What remains"), "Repository tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

    expect(createWorkEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        taskId: "t1",
        source: "focus",
        startedAt: expect.any(String),
        endedAt: expect.any(String),
        durationSeconds: expect.any(Number),
        done: "Added migration",
        remains: "Repository tests",
        nextStep: "Run cargo test"
      })
    );
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

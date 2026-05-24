import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";
import { api } from "../shared/api/client";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    createProject: vi.fn()
  }
}));

const listProjects = vi.mocked(api.listProjects);
const createProject = vi.mocked(api.createProject);

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

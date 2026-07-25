import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("api", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes the list_project_summaries command", async () => {
    await api.listProjectSummaries();
    expect(invoke).toHaveBeenCalledWith("list_project_summaries");
  });

  it("inspects a local project folder", async () => {
    await api.inspectProjectFolder("/tmp/desclop");

    expect(invoke).toHaveBeenCalledWith("inspect_project_folder", {
      localPath: "/tmp/desclop"
    });
  });

  it("invokes the delete_project command with the project id", async () => {
    await api.deleteProject("project-123");

    expect(invoke).toHaveBeenCalledWith("delete_project", {
      projectId: "project-123"
    });
  });

  it("invokes data-safety commands with their explicit restore confirmation", async () => {
    await api.getDatabaseStatus();
    await api.getProjectDiagnostics("project-123");
    await api.relinkProjectFolder("project-123", "/tmp/relinked");
    await api.inspectProjectBundle("/tmp/backup.desclop");
    await api.importProjectBundle("/tmp/backup.desclop", "/tmp/relinked", true);

    expect(invoke).toHaveBeenNthCalledWith(1, "get_database_status");
    expect(invoke).toHaveBeenNthCalledWith(2, "get_project_diagnostics", {
      projectId: "project-123"
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "relink_project_folder", {
      projectId: "project-123",
      localPath: "/tmp/relinked"
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "inspect_project_bundle", {
      bundleFolder: "/tmp/backup.desclop"
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "import_project_bundle", {
      bundleFolder: "/tmp/backup.desclop",
      reselectedLocalPath: "/tmp/relinked",
      confirmed: true
    });
  });

  it("invokes native desktop settings commands", async () => {
    await api.setCloseBehavior("quit");
    await api.setCaptureShortcut("F8");
    await api.quitApp();

    expect(invoke).toHaveBeenNthCalledWith(1, "set_close_behavior", {
      behavior: "quit"
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "set_capture_shortcut", {
      shortcut: "F8"
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "quit_app");
  });
});

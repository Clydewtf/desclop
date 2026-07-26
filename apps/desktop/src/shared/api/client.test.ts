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

  it("invokes local plan-structure commands with scoped input", async () => {
    await api.updatePlan({ planId: "plan-1", title: "Plan" });
    await api.reorderPlan({ planId: "plan-1", position: 1 });
    await api.updateStage({ stageId: "stage-1", title: "Stage", description: "Context" });
    await api.reorderStage({ stageId: "stage-1", position: 0 });
    await api.updateTask({ taskId: "task-1", title: "Task", description: "Context" });
    await api.reorderTask({ taskId: "task-1", position: 1 });
    await api.updateChecklistItemDetails({ itemId: "item-1", title: "Check", description: "Context" });
    await api.reorderChecklistItem({ itemId: "item-1", position: 0 });
    await api.createTask({ stageId: "stage-1", title: "New task", description: "Context", position: 1 });
    await api.createChecklistItem({ taskId: "task-1", title: "New check", description: "Context", position: 1 });
    await api.moveTask({ taskId: "task-1", toStageId: "stage-2", position: 0 });

    expect(invoke).toHaveBeenNthCalledWith(1, "update_plan", {
      input: { planId: "plan-1", title: "Plan" }
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "reorder_plan", {
      input: { planId: "plan-1", position: 1 }
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "update_stage", {
      input: { stageId: "stage-1", title: "Stage", description: "Context" }
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "reorder_stage", {
      input: { stageId: "stage-1", position: 0 }
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "update_task", {
      input: { taskId: "task-1", title: "Task", description: "Context" }
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "reorder_task", {
      input: { taskId: "task-1", position: 1 }
    });
    expect(invoke).toHaveBeenNthCalledWith(7, "update_checklist_item_details", {
      input: { itemId: "item-1", title: "Check", description: "Context" }
    });
    expect(invoke).toHaveBeenNthCalledWith(8, "reorder_checklist_item", {
      input: { itemId: "item-1", position: 0 }
    });
    expect(invoke).toHaveBeenNthCalledWith(9, "create_task", {
      input: { stageId: "stage-1", title: "New task", description: "Context", position: 1 }
    });
    expect(invoke).toHaveBeenNthCalledWith(10, "create_checklist_item", {
      input: { taskId: "task-1", title: "New check", description: "Context", position: 1 }
    });
    expect(invoke).toHaveBeenNthCalledWith(11, "move_task", {
      input: { taskId: "task-1", toStageId: "stage-2", position: 0 }
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

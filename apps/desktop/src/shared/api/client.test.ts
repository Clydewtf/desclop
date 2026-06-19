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

  it("invokes the delete_project command with the project id", async () => {
    await api.deleteProject("project-123");

    expect(invoke).toHaveBeenCalledWith("delete_project", {
      projectId: "project-123"
    });
  });
});

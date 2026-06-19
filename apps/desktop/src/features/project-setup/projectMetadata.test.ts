import { describe, expect, it } from "vitest";
import type { Project, ProjectSummary } from "../../shared/domain/types";
import { buildProjectMetadataParts, shortenHomePath } from "./projectMetadata";

const project: Project = {
  id: "p1",
  name: "Desclop",
  localPath: "/Users/clyde/projects/desclop",
  gitEnabled: true,
  gitRemote: null,
  activeTaskId: "t1",
  createdAt: "2026-06-15T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z"
};

const summary: ProjectSummary = {
  projectId: "p1",
  taskCount: 12,
  openInboxCount: 3,
  activeTaskTitle: "Delete project"
};

describe("project metadata", () => {
  it("shortens a path inside the home directory", () => {
    expect(shortenHomePath("/Users/clyde/projects/desclop", "/Users/clyde")).toBe(
      "~/projects/desclop"
    );
  });

  it("builds project metadata in display order", () => {
    expect(buildProjectMetadataParts(project, summary, "/Users/clyde")).toEqual([
      "~/projects/desclop",
      "Updated Jun 16, 2026",
      "12 tasks",
      "3 inbox items",
      "Active: Delete project"
    ]);
  });

  it("shows that no plan is imported when the project has no plan data", () => {
    expect(
      buildProjectMetadataParts(
        { ...project, activeTaskId: null },
        { ...summary, taskCount: 0, openInboxCount: 0, activeTaskTitle: null },
        "/Users/clyde"
      )
    ).toContain("No plan imported");
  });
});

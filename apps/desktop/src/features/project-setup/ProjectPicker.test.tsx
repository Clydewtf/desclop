import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { Project } from "../../shared/domain/types";
import { ProjectPicker } from "./ProjectPicker";

const project: Project = {
  id: "project-123",
  name: "Desclop Manual QA",
  localPath: "/tmp/desclop-manual-qa",
  gitEnabled: true,
  gitRemote: null,
  activeTaskId: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z"
};

interface RenderPickerOptions {
  onOpenProject?: (project: Project) => void | Promise<void>;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  deletingProjectId?: string | null;
  deleteError?: string | null;
}

function renderPicker({
  onOpenProject = vi.fn(),
  onDeleteProject = vi.fn(),
  deletingProjectId = null,
  deleteError = null
}: RenderPickerOptions = {}) {
  return renderWithRouter(
    <ProjectPicker
      projects={[project]}
      onOpenProject={onOpenProject}
      onCreateProject={vi.fn()}
      onDeleteProject={onDeleteProject}
      deletingProjectId={deletingProjectId}
      deleteError={deleteError}
    />
  );
}

describe("ProjectPicker", () => {
  it("opens deletion confirmation without opening the project", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();

    renderPicker({ onOpenProject });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onOpenProject).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();
  });

  it("names the project in the exact deletion warning", async () => {
    const user = userEvent.setup();

    renderPicker();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete project" });
    expect(dialog).toHaveAccessibleDescription(
      "Delete “Desclop Manual QA” from Desclop? Local project files will not be deleted."
    );
    expect(within(dialog).getByText("Desclop Manual QA", { exact: false })).toBeInTheDocument();
  });

  it("closes confirmation on cancel without deleting or opening", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onDeleteProject = vi.fn();

    renderPicker({ onOpenProject, onDeleteProject });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDeleteProject).not.toHaveBeenCalled();
    expect(onOpenProject).not.toHaveBeenCalled();
  });

  it("confirms project deletion once", async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn();

    renderPicker({ onDeleteProject });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(onDeleteProject).toHaveBeenCalledTimes(1);
    expect(onDeleteProject).toHaveBeenCalledWith(project);
  });

  it("disables confirmation while the matching project is being deleted", async () => {
    const user = userEvent.setup();

    renderPicker({ deletingProjectId: project.id });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("button", { name: "Delete project" })).toBeDisabled();
  });

  it("shows a supplied deletion error while keeping the project available", async () => {
    const user = userEvent.setup();

    renderPicker({ deleteError: "Unable to delete project." });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete project" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Unable to delete project.");
    expect(screen.getByRole("button", { name: "Desclop Manual QA" })).toBeInTheDocument();
  });
});

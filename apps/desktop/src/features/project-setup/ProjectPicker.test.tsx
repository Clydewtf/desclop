import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { Project, ProjectSummary } from "../../shared/domain/types";
import { ProjectPicker, type ProjectDeleteError } from "./ProjectPicker";

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

const secondProject: Project = {
  ...project,
  id: "project-456",
  name: "Release Planning",
  localPath: "/tmp/release-planning"
};

interface RenderPickerOptions {
  projects?: Project[];
  projectSummaries?: Record<string, ProjectSummary>;
  homePath?: string;
  onOpenProject?: (project: Project) => void | Promise<void>;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  onDeleteDialogChange?: (projectId: string | null) => void;
  deletingProjectId?: string | null;
  deleteError?: ProjectDeleteError | null;
}

function renderPicker({
  projects = [project],
  projectSummaries = {},
  homePath = "",
  onOpenProject = vi.fn(),
  onDeleteProject = vi.fn(),
  onDeleteDialogChange = vi.fn(),
  deletingProjectId = null,
  deleteError = null
}: RenderPickerOptions = {}) {
  return renderWithRouter(
    <ProjectPicker
      projects={projects}
      projectSummaries={projectSummaries}
      homePath={homePath}
      onOpenProject={onOpenProject}
      onCreateProject={vi.fn()}
      onDeleteProject={onDeleteProject}
      onDeleteDialogChange={onDeleteDialogChange}
      deletingProjectId={deletingProjectId}
      deleteError={deleteError}
    />
  );
}

describe("ProjectPicker", () => {
  it("renders lightweight metadata for a saved project", () => {
    renderPicker({
      projectSummaries: {
        [project.id]: {
          projectId: project.id,
          taskCount: 12,
          openInboxCount: 3,
          activeTaskTitle: "Create local store"
        }
      },
      homePath: "/tmp"
    });

    const projectRow = screen.getByRole("group", { name: project.name });
    expect(projectRow).toHaveTextContent("~/desclop-manual-qa");
    expect(projectRow).toHaveTextContent("12 tasks");
    expect(projectRow).toHaveTextContent("3 inbox items");
    expect(projectRow).toHaveTextContent("Active: Create local store");
  });

  it("keeps Open project primary and uses a separate delete control", () => {
    renderPicker();

    const openButton = screen.getByRole("button", {
      name: /Desclop Manual QA.*Open project/s
    });
    const deleteButton = screen.getByRole("button", { name: "Delete Desclop Manual QA" });

    expect(openButton).toHaveAttribute("data-project-action", "open");
    expect(deleteButton).toHaveClass("project-picker__delete");
  });

  it("hides deletion controls when no delete callback is supplied", () => {
    renderWithRouter(
      <ProjectPicker
        projects={[project]}
        onOpenProject={vi.fn()}
        onCreateProject={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: `Delete ${project.name}` })
    ).not.toBeInTheDocument();
  });

  it("renders a separate delete control for each project and confirms the selected project", async () => {
    const user = userEvent.setup();

    renderPicker({ projects: [project, secondProject] });

    const firstProjectRow = screen.getByRole("group", { name: project.name });
    const secondProjectRow = screen.getByRole("group", { name: secondProject.name });
    expect(
      within(firstProjectRow).getByRole("button", { name: `Delete ${project.name}` })
    ).toBeInTheDocument();
    expect(
      within(secondProjectRow).getByRole("button", { name: `Delete ${secondProject.name}` })
    ).toBeInTheDocument();

    await user.click(
      within(secondProjectRow).getByRole("button", { name: `Delete ${secondProject.name}` })
    );

    expect(screen.getByRole("dialog", { name: "Delete project" })).toHaveAccessibleDescription(
      "Delete “Release Planning” from Desclop? Local project files will not be deleted."
    );
  });

  it("opens deletion confirmation without opening the project", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();

    renderPicker({ onOpenProject });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    expect(onOpenProject).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();
  });

  it("names the project in the exact deletion warning", async () => {
    const user = userEvent.setup();

    renderPicker();
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

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
    const deleteButton = screen.getByRole("button", { name: `Delete ${project.name}` });
    await user.click(deleteButton);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDeleteProject).not.toHaveBeenCalled();
    expect(onOpenProject).not.toHaveBeenCalled();
    expect(deleteButton).toHaveFocus();
  });

  it("notifies when the delete dialog opens and closes", async () => {
    const user = userEvent.setup();
    const onDeleteDialogChange = vi.fn();

    renderPicker({ onDeleteDialogChange });

    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDeleteDialogChange).toHaveBeenNthCalledWith(1, project.id);
    expect(onDeleteDialogChange).toHaveBeenNthCalledWith(2, null);
  });

  it("confirms project deletion once", async () => {
    const user = userEvent.setup();
    const onDeleteProject = vi.fn();

    renderPicker({ onDeleteProject });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    expect(onDeleteProject).toHaveBeenCalledTimes(1);
    expect(onDeleteProject).toHaveBeenCalledWith(project);
  });

  it("disables confirmation while the matching project is being deleted", async () => {
    const user = userEvent.setup();

    renderPicker({ deletingProjectId: project.id });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    expect(screen.getByRole("button", { name: "Delete project" })).toBeDisabled();
  });

  it("keeps confirmation enabled when another project is being deleted", async () => {
    const user = userEvent.setup();

    renderPicker({ deletingProjectId: secondProject.id });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    expect(screen.getByRole("button", { name: "Delete project" })).toBeEnabled();
  });

  it("focuses Cancel when the confirmation opens", async () => {
    const user = userEvent.setup();

    renderPicker();
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("closes on Escape and restores focus to the opening delete button", async () => {
    const user = userEvent.setup();

    renderPicker();
    const deleteButton = screen.getByRole("button", { name: `Delete ${project.name}` });
    await user.click(deleteButton);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
  });

  it("does not close on Escape while deletion is pending", async () => {
    const user = userEvent.setup();

    renderPicker({ deletingProjectId: project.id });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Delete project" })).toBeInTheDocument();
  });

  it("traps forward and backward tab focus within the confirmation", async () => {
    const user = userEvent.setup();

    renderPicker();
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Delete project" });

    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
  });

  it("prevents Cancel dismissal and keeps focus valid while deletion is pending", async () => {
    const user = userEvent.setup();

    renderPicker({ deletingProjectId: project.id });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    const dialog = screen.getByRole("dialog", { name: "Delete project" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete project" })).toBeDisabled();
    expect(dialog).toHaveFocus();

    await user.click(cancelButton);

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveFocus();
  });

  it("shows a supplied deletion error while keeping the project available", async () => {
    const user = userEvent.setup();

    renderPicker({
      deleteError: { projectId: project.id, message: "Unable to delete project." }
    });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    const dialog = screen.getByRole("dialog", { name: "Delete project" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Unable to delete project.");
    expect(
      screen.getByRole("button", { name: /Desclop Manual QA.*Open project/s })
    ).toBeInTheDocument();
  });

  it("does not show one project's deletion error in another project's confirmation", async () => {
    const user = userEvent.setup();

    renderPicker({
      projects: [project, secondProject],
      deleteError: { projectId: project.id, message: "Unable to delete project." }
    });
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to delete project.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: `Delete ${secondProject.name}` }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Delete project" })).toHaveAccessibleDescription(
      "Delete “Release Planning” from Desclop? Local project files will not be deleted."
    );
  });

  it("focuses the next project's Open control when the selected project is removed", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onDeleteProject = vi.fn();
    const { rerender } = render(
      <ProjectPicker
        projects={[project, secondProject]}
        onOpenProject={onOpenProject}
        onCreateProject={vi.fn()}
        onDeleteProject={onDeleteProject}
      />
    );
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    rerender(
      <ProjectPicker
        projects={[secondProject]}
        onOpenProject={onOpenProject}
        onCreateProject={vi.fn()}
        onDeleteProject={onDeleteProject}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Release Planning.*Open project/s })
    ).toHaveFocus();
  });

  it("focuses Create new project when the selected project was the last row", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onCreateProject = vi.fn();
    const onDeleteProject = vi.fn();
    const { rerender } = render(
      <ProjectPicker
        projects={[project]}
        onOpenProject={onOpenProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
    );
    await user.click(screen.getByRole("button", { name: `Delete ${project.name}` }));

    rerender(
      <ProjectPicker
        projects={[]}
        onOpenProject={onOpenProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new project" })).toHaveFocus();
  });
});

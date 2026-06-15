import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { type Project } from "../../shared/domain/types";
import { Button, InlineAlert, ScreenHeader, Surface } from "../../shared/ui";

export interface ProjectDeleteError {
  projectId: string;
  message: string;
}

interface ProjectPickerProps {
  projects: Project[];
  onOpenProject: (project: Project) => void | Promise<void>;
  onCreateProject: () => void;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  deletingProjectId?: string | null;
  deleteError?: ProjectDeleteError | null;
}

export function ProjectPicker({
  projects,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  deletingProjectId = null,
  deleteError = null
}: ProjectPickerProps) {
  const [projectToDeleteId, setProjectToDeleteId] = useState<string | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const projectListRef = useRef<HTMLDivElement | null>(null);
  const projectToDeleteIndexRef = useRef(0);
  const shouldRestoreFocusRef = useRef(false);
  const projectToDelete = projects.find((project) => project.id === projectToDeleteId) ?? null;
  const isDeletingProject = deletingProjectId === projectToDelete?.id;
  const projectDeleteError =
    deleteError && deleteError.projectId === projectToDelete?.id ? deleteError.message : null;

  useEffect(() => {
    if (projectToDelete && onDeleteProject) {
      if (isDeletingProject) {
        dialogRef.current?.focus();
      } else {
        dialogRef.current
          ?.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')
          ?.focus();
      }
      return;
    }

    if (!shouldRestoreFocusRef.current) {
      return;
    }

    const openingDeleteButton = deleteButtonRef.current;
    if (openingDeleteButton?.isConnected) {
      openingDeleteButton.focus();
    } else {
      const fallbackProject =
        projects[projectToDeleteIndexRef.current] ??
        projects[projectToDeleteIndexRef.current - 1] ??
        null;
      const picker = projectListRef.current?.parentElement;
      const openButtons = Array.from(
        picker?.querySelectorAll<HTMLButtonElement>('[data-project-action="open"]') ?? []
      );
      const fallbackButton = fallbackProject
        ? openButtons.find((button) => button.dataset.projectId === fallbackProject.id)
        : picker?.querySelector<HTMLButtonElement>('[data-project-action="create"]');
      fallbackButton?.focus();
    }

    shouldRestoreFocusRef.current = false;
    deleteButtonRef.current = null;
    if (projectToDeleteId) {
      setProjectToDeleteId(null);
    }
  }, [isDeletingProject, onDeleteProject, projectToDelete, projectToDeleteId, projects]);

  function closeDeleteDialog() {
    if (isDeletingProject) {
      return;
    }
    setProjectToDeleteId(null);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !isDeletingProject) {
      event.preventDefault();
      closeDeleteDialog();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
    );
    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons.at(-1);
    if (!firstButton || !lastButton) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  }

  return (
    <Surface ariaLabel="Saved projects" className="start-flow project-picker">
      <ScreenHeader
        title="Open a project"
        description="Choose a saved local project or create a new one."
      />
      <div ref={projectListRef} className="project-picker__list">
        {projects.map((project, projectIndex) => (
          <div
            key={project.id}
            className="project-picker__item"
            role="group"
            aria-label={project.name}
          >
            <Button
              type="button"
              variant="secondary"
              className="project-picker__project"
              aria-label={project.name}
              data-project-action="open"
              data-project-id={project.id}
              onClick={() => void onOpenProject(project)}
            >
              <span>{project.name}</span>
              <span className="project-picker__action">Open project</span>
            </Button>
            {onDeleteProject ? (
              <Button
                type="button"
                variant="secondary"
                aria-label={`Delete ${project.name}`}
                onClick={(event) => {
                  deleteButtonRef.current = event.currentTarget;
                  projectToDeleteIndexRef.current = projectIndex;
                  shouldRestoreFocusRef.current = true;
                  setProjectToDeleteId(project.id);
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Button type="button" data-project-action="create" onClick={onCreateProject}>
        Create new project
      </Button>
      {projectToDelete && onDeleteProject ? (
        <div className="project-picker__dialog-backdrop">
          <div
            ref={dialogRef}
            className="project-picker__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id={dialogTitleId}>Delete project</h2>
            <p id={dialogDescriptionId}>
              Delete “{projectToDelete.name}” from Desclop? Local project files will not be deleted.
            </p>
            {projectDeleteError ? (
              <InlineAlert tone="error">{projectDeleteError}</InlineAlert>
            ) : null}
            <div className="project-picker__dialog-actions">
              <Button
                type="button"
                variant="secondary"
                data-dialog-action="cancel"
                disabled={isDeletingProject}
                onClick={closeDeleteDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isDeletingProject}
                onClick={() => void onDeleteProject(projectToDelete)}
              >
                Delete project
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

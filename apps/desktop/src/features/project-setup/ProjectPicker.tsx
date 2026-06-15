import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { type Project } from "../../shared/domain/types";
import { Button, InlineAlert, ScreenHeader, Surface } from "../../shared/ui";

interface ProjectPickerProps {
  projects: Project[];
  onOpenProject: (project: Project) => void | Promise<void>;
  onCreateProject: () => void;
  onDeleteProject?: (project: Project) => void | Promise<void>;
  deletingProjectId?: string | null;
  deleteError?: string | null;
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
  const projectToDelete = projects.find((project) => project.id === projectToDeleteId) ?? null;
  const isDeletingProject = deletingProjectId === projectToDelete?.id;

  useEffect(() => {
    if (projectToDelete) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]')
        ?.focus();
    } else {
      deleteButtonRef.current?.focus();
    }
  }, [projectToDelete]);

  function closeDeleteDialog() {
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
      <div className="project-picker__list">
        {projects.map((project) => (
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
              onClick={() => void onOpenProject(project)}
            >
              <span>{project.name}</span>
              <span className="project-picker__action">Open project</span>
            </Button>
            {onDeleteProject ? (
              <Button
                type="button"
                variant="secondary"
                onClick={(event) => {
                  deleteButtonRef.current = event.currentTarget;
                  setProjectToDeleteId(project.id);
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Button type="button" onClick={onCreateProject}>
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
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id={dialogTitleId}>Delete project</h2>
            <p id={dialogDescriptionId}>
              Delete “{projectToDelete.name}” from Desclop? Local project files will not be deleted.
            </p>
            {deleteError ? <InlineAlert tone="error">{deleteError}</InlineAlert> : null}
            <div className="project-picker__dialog-actions">
              <Button
                type="button"
                variant="secondary"
                data-dialog-action="cancel"
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

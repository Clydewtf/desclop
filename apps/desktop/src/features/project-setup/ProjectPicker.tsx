import { useId, useState } from "react";
import { type Project } from "../../shared/domain/types";
import { Button, InlineAlert, ScreenHeader, Surface } from "../../shared/ui";

interface ProjectPickerProps {
  projects: Project[];
  onOpenProject: (project: Project) => void | Promise<void>;
  onCreateProject: () => void;
  onDeleteProject: (project: Project) => void | Promise<void>;
  deletingProjectId: string | null;
  deleteError: string | null;
}

export function ProjectPicker({
  projects,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  deletingProjectId,
  deleteError
}: ProjectPickerProps) {
  const [projectToDeleteId, setProjectToDeleteId] = useState<string | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const projectToDelete = projects.find((project) => project.id === projectToDeleteId) ?? null;

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
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProjectToDeleteId(project.id)}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" onClick={onCreateProject}>
        Create new project
      </Button>
      {projectToDelete ? (
        <div className="project-picker__dialog-backdrop">
          <div
            className="project-picker__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
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
                onClick={() => setProjectToDeleteId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={deletingProjectId === projectToDelete.id}
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

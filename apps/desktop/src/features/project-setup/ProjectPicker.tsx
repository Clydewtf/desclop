import { type Project } from "../../shared/domain/types";
import { Button, ScreenHeader, Surface } from "../../shared/ui";

interface ProjectPickerProps {
  projects: Project[];
  onOpenProject: (project: Project) => void | Promise<void>;
  onCreateProject: () => void;
}

export function ProjectPicker({
  projects,
  onOpenProject,
  onCreateProject
}: ProjectPickerProps) {
  return (
    <Surface ariaLabel="Saved projects" className="start-flow project-picker">
      <ScreenHeader
        title="Open a project"
        description="Choose a saved local project or create a new one."
      />
      <div className="project-picker__list">
        {projects.map((project) => (
          <Button
            key={project.id}
            type="button"
            variant="secondary"
            className="project-picker__project"
            aria-label={project.name}
            onClick={() => void onOpenProject(project)}
          >
            <span>{project.name}</span>
            <span className="project-picker__action">Open project</span>
          </Button>
        ))}
      </div>
      <Button type="button" onClick={onCreateProject}>
        Create new project
      </Button>
    </Surface>
  );
}

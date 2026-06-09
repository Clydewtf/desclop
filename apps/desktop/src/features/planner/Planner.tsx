import type { PlannerFrame } from "./plannerEngine";
import { Button, ScreenHeader, TaskStatusBadge } from "../../shared/ui";

interface PlannerProps {
  frames: PlannerFrame[];
  onContinueTask: (taskId: string) => void;
}

export function Planner({ frames, onContinueTask }: PlannerProps) {
  return (
    <section className="planner-map stack" aria-label="Plan">
      <ScreenHeader
        title="Plan"
        description="Stages and nearby work from the imported plan."
      />
      <div className="stage-list">
        {frames.map((frame) => (
          <article
            aria-labelledby={`${frame.stage.id}-title`}
            className={`stage-frame stage-frame--${frame.stage.status}`}
            key={frame.stage.id}
          >
            <header className="stage-frame__header">
              <div>
                <p className="stage-frame__status">{stageStatusLabel(frame.stage.status)}</p>
                <h2 id={`${frame.stage.id}-title`}>{frame.stage.title}</h2>
              </div>
              <div className="stage-frame__progress" aria-label={`${frame.stage.title} progress`}>
                <span>
                  {frame.progress.completedTasks}/{frame.progress.totalTasks} tasks
                </span>
                <span>
                  {frame.progress.completedChecklist}/{frame.progress.totalChecklist} checklist
                </span>
              </div>
            </header>

            {frame.collapsed ? (
              <div className="stage-frame__summary">
                <p>
                  {frame.progress.completedTasks}/{frame.progress.totalTasks} tasks done.{" "}
                  {frame.progress.completedChecklist}/{frame.progress.totalChecklist} checklist
                  complete.
                </p>
                <div className="task-list task-list--collapsed">
                  {frame.tasks.map((task) => (
                    <div className="task-row task-row--summary" key={task.id}>
                      <div className="task-row__title">
                        <span>{task.title}</span>
                        <TaskStatusBadge status={task.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="task-list">
                {frame.tasks.map((task) => (
                  <div className="task-row" key={task.id}>
                    <div className="task-row__content">
                      <div className="task-row__title">
                        <span>{task.title}</span>
                        <TaskStatusBadge status={task.status} />
                      </div>
                      <small>
                        {task.checklist.filter((item) => item.completed).length}/
                        {task.checklist.length} checklist
                      </small>
                      {task.nextStep ? (
                        <p className="task-row__next-step">{task.nextStep}</p>
                      ) : null}
                    </div>
                    <Button variant="secondary" onClick={() => onContinueTask(task.id)}>
                      Continue {task.title}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function stageStatusLabel(status: PlannerFrame["stage"]["status"]) {
  const labels: Record<PlannerFrame["stage"]["status"], string> = {
    completed: "Completed",
    current: "Current",
    future: "Future"
  };

  return labels[status];
}

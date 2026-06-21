import type { PlannerFrame } from "./plannerEngine";
import { Button, ScreenHeader, TaskStatusBadge } from "../../shared/ui";

interface PlannerProps {
  frames: PlannerFrame[];
  onOpenTask: (taskId: string, options: { activate: boolean }) => void;
}

export function Planner({ frames, onOpenTask }: PlannerProps) {
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
              <div
                className="stage-frame__progress"
                aria-label={`${frame.stage.title} progress summary`}
              >
                <span>{frame.progress.tasksLabel}</span>
                {frame.progress.checklistLabel ? (
                  <span>{frame.progress.checklistLabel}</span>
                ) : null}
              </div>
              <div
                className="stage-frame__progress-bar"
                role="progressbar"
                aria-label={`${frame.stage.title} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={frame.progress.percent}
              >
                <span style={{ width: `${frame.progress.percent}%` }} />
              </div>
            </header>

            {frame.collapsed ? (
              <div className="stage-frame__summary">
                <p>
                  {frame.progress.tasksLabel}
                  {frame.progress.checklistLabel ? ` · ${frame.progress.checklistLabel}` : ""}
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
                {frame.tasks.map((task) => {
                  const isRecommended = task.id === frame.recommendedTaskId;
                  const completedChecklist = task.checklist.filter(
                    (item) => item.completed
                  ).length;
                  const actionLabel = task.status === "done" ? "Open" : "Continue";

                  return (
                    <div
                      className={`task-row${isRecommended ? " task-row--recommended" : ""}`}
                      key={task.id}
                    >
                      <div className="task-row__content">
                        <div className="task-row__title">
                          <span>{task.title}</span>
                          {isRecommended ? (
                            <span className="task-row__next-marker">Next</span>
                          ) : null}
                          <TaskStatusBadge status={task.status} />
                        </div>
                        {task.nextStep ? (
                          <p className="task-row__next-step">Next: {task.nextStep}</p>
                        ) : null}
                        {task.checklist.length > 0 ? (
                          <small>
                            {completedChecklist}/{task.checklist.length} checklist
                          </small>
                        ) : null}
                      </div>
                      <Button
                        variant="secondary"
                        aria-label={`${actionLabel} ${task.title}`}
                        onClick={() =>
                          onOpenTask(task.id, { activate: task.status !== "done" })
                        }
                      >
                        {actionLabel}
                      </Button>
                    </div>
                  );
                })}
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

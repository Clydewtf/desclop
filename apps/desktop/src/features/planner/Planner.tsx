import type { PlannerFrame } from "./plannerEngine";

interface PlannerProps {
  frames: PlannerFrame[];
  onContinueTask: (taskId: string) => void;
}

export function Planner({ frames, onContinueTask }: PlannerProps) {
  return (
    <section className="stack" aria-label="Planner">
      <div className="stage-list">
        {frames.map((frame) => (
          <article
            aria-labelledby={`${frame.stage.id}-title`}
            className="stage-frame"
            key={frame.stage.id}
          >
            <header>
              <h3 id={`${frame.stage.id}-title`}>{frame.stage.title}</h3>
              <p>{frame.stage.status}</p>
              <p>
                {frame.progress.completedTasks}/{frame.progress.totalTasks} tasks,{" "}
                {frame.progress.completedChecklist}/{frame.progress.totalChecklist} checklist
              </p>
            </header>

            {!frame.collapsed ? (
              <div>
                {frame.tasks.map((task) => (
                  <div className="task-row" key={task.id}>
                    <div>
                      <span>{task.title}</span>
                      <small>
                        {task.status}
                        {task.checklist.length > 0
                          ? `, ${task.checklist.filter((item) => item.completed).length}/${task.checklist.length} checklist`
                          : ""}
                      </small>
                    </div>
                    <button type="button" onClick={() => onContinueTask(task.id)}>
                      Continue {task.title}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

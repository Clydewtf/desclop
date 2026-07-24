import { useState } from "react";
import type { ChecklistItem } from "../../shared/domain/types";
import type { PlanFrame, PlannerFrame } from "./plannerEngine";
import { Button, ScreenHeader, TaskStatusBadge } from "../../shared/ui";

interface PlannerProps {
  frames?: PlannerFrame[];
  planFrames?: PlanFrame[];
  onOpenTask: (taskId: string, options: { activate: boolean }) => void;
}

export function Planner({ frames = [], planFrames, onOpenTask }: PlannerProps) {
  const [expandedCompletedPlanIds, setExpandedCompletedPlanIds] = useState<Set<string>>(
    () => new Set()
  );
  const renderedPlanFrames = planFrames ?? legacyPlanFrames(frames);

  function toggleCompletedPlan(planId: string) {
    setExpandedCompletedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }

  return (
    <section className="planner-map stack" aria-label="Plan">
      <ScreenHeader
        title="Plan"
        description="Plans, stages, and nearby work from imported Markdown."
      />
      <div className="plan-list">
        {renderedPlanFrames.map((planFrame) => {
          const isCollapsed =
            planFrame.collapsed && !expandedCompletedPlanIds.has(planFrame.plan.id);
          const toggleLabel = expandedCompletedPlanIds.has(planFrame.plan.id)
            ? "Hide plan"
            : "Show plan";

          return (
            <article
              aria-labelledby={`${planFrame.plan.id}-title`}
              className={`plan-frame${planFrame.collapsed ? " plan-frame--collapsed" : ""}`}
              key={planFrame.plan.id}
            >
              <header className="plan-frame__header">
                <div>
                  <p className="stage-frame__status">
                    {planFrame.collapsed ? "Completed plan" : "Active plan"}
                  </p>
                  <h2 id={`${planFrame.plan.id}-title`}>{planFrame.plan.title}</h2>
                </div>
                <div className="plan-frame__meta">
                  <div
                    className="stage-frame__progress"
                    aria-label={`${planFrame.plan.title} progress summary`}
                  >
                    <span>{planFrame.progress.tasksLabel}</span>
                    {planFrame.progress.checklistLabel ? (
                      <span>{planFrame.progress.checklistLabel}</span>
                    ) : null}
                  </div>
                  {planFrame.collapsed ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`${toggleLabel} ${planFrame.plan.title}`}
                      onClick={() => toggleCompletedPlan(planFrame.plan.id)}
                    >
                      {toggleLabel}
                    </Button>
                  ) : null}
                </div>
                <div
                  className="stage-frame__progress-bar"
                  role="progressbar"
                  aria-label={`${planFrame.plan.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={planFrame.progress.percent}
                >
                  <span style={{ width: `${planFrame.progress.percent}%` }} />
                </div>
              </header>
              {isCollapsed ? (
                <div className="stage-frame__summary">
                  <p>
                    {planFrame.stageFrames.length}{" "}
                    {planFrame.stageFrames.length === 1 ? "stage" : "stages"} ·{" "}
                    {planFrame.progress.tasksLabel}
                    {planFrame.progress.checklistLabel
                      ? ` · ${planFrame.progress.checklistLabel}`
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="stage-list">
                  {planFrame.stageFrames.map((frame) => renderStageFrame(frame, onOpenTask))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function legacyPlanFrames(frames: PlannerFrame[]): PlanFrame[] {
  if (frames.length === 0) {
    return [];
  }

  const completedTasks = frames.reduce((sum, frame) => sum + frame.progress.completedTasks, 0);
  const totalTasks = frames.reduce((sum, frame) => sum + frame.progress.totalTasks, 0);
  const completedChecklist = frames.reduce(
    (sum, frame) => sum + frame.progress.completedChecklist,
    0
  );
  const totalChecklist = frames.reduce((sum, frame) => sum + frame.progress.totalChecklist, 0);

  return [
    {
      plan: {
        id: "legacy-plan",
        projectId: frames[0].stage.projectId,
        title: "Imported plan",
        position: 0
      },
      collapsed: frames.every((frame) => frame.stage.status === "completed"),
      stageFrames: frames,
      progress: {
        completedTasks,
        totalTasks,
        completedChecklist,
        totalChecklist,
        percent: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
        tasksLabel: `${completedTasks}/${totalTasks} tasks`,
        checklistLabel:
          totalChecklist > 0 ? `${completedChecklist}/${totalChecklist} checklist` : null
      }
    }
  ];
}

function renderStageFrame(
  frame: PlannerFrame,
  onOpenTask: PlannerProps["onOpenTask"]
) {
  return (
    <article
      aria-labelledby={`${frame.stage.id}-title`}
      className={`stage-frame stage-frame--${frame.stage.status}`}
      key={frame.stage.id}
    >
      <header className="stage-frame__header">
        <div>
          <p className="stage-frame__status">{stageStatusLabel(frame.stage.status)}</p>
          <h2 id={`${frame.stage.id}-title`}>{frame.stage.title}</h2>
          {frame.stage.description ? (
            <details className="stage-description-details">
              <summary>Stage context</summary>
              <p>{frame.stage.description}</p>
            </details>
          ) : null}
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
                <div className="task-row__content">
                  <div className="task-row__title">
                    <span>{task.title}</span>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  {task.description ? (
                    <details className="task-description-details">
                      <summary>Task details</summary>
                      <p>{task.description}</p>
                    </details>
                  ) : null}
                  <ChecklistDescriptions items={task.checklist} />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Open ${task.title}`}
                  onClick={() => onOpenTask(task.id, { activate: false })}
                >
                  Open
                </Button>
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
                  {task.description ? (
                    <details className="task-description-details">
                      <summary>Task details</summary>
                      <p>{task.description}</p>
                    </details>
                  ) : null}
                  <ChecklistDescriptions items={task.checklist} />
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
  );
}

function ChecklistDescriptions({ items }: { items: ChecklistItem[] }) {
  const describedItems = items.filter((item) => item.description);
  if (describedItems.length === 0) {
    return null;
  }

  return (
    <details className="task-checklist__details">
      <summary>Checklist details</summary>
      <ul className="task-checklist__description-list">
        {describedItems.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
    </details>
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

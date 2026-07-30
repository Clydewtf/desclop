import { useEffect, useRef, useState } from "react";
import type { ChecklistItem, Task } from "../../shared/domain/types";
import type { PlanFrame, PlannerFrame } from "./plannerEngine";
import {
  DEFAULT_PLANNER_VIEW_STATE,
  readPlannerViewState,
  writePlannerViewState,
  type PlannerViewState
} from "./plannerViewState";
import { Button, ScreenHeader, TaskStatusBadge } from "../../shared/ui";

interface PlannerProps {
  frames?: PlannerFrame[];
  planFrames?: PlanFrame[];
  projectId?: string;
  archivedPlanIds?: string[];
  onArchivePlan?: (planId: string) => void;
  onRestorePlan?: (planId: string) => void;
  onOpenTask: (taskId: string, options: { activate: boolean }) => void;
}

export function Planner({
  frames = [],
  planFrames,
  projectId,
  archivedPlanIds = [],
  onArchivePlan,
  onRestorePlan,
  onOpenTask
}: PlannerProps) {
  const [viewState, setViewState] = useState<PlannerViewState>(() =>
    readCurrentPlannerViewState(projectId)
  );
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null);
  const editPlanButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setViewState(readCurrentPlannerViewState(projectId));
    setEditingPlanId(null);
    setHasUnsavedChanges(false);
    setFocusPlanId(null);
  }, [projectId]);

  useEffect(() => {
    if (!focusPlanId) {
      return;
    }

    editPlanButtonRefs.current[focusPlanId]?.focus();
    setFocusPlanId(null);
  }, [focusPlanId]);

  const renderedPlanFrames = planFrames ?? legacyPlanFrames(frames);
  const archivedIdSet = new Set(archivedPlanIds);
  const expandedPlanIds = new Set(viewState.expandedPlanIds);
  const collapsedPlanIds = new Set(viewState.collapsedPlanIds);
  const expandedStageIds = new Set(viewState.expandedStageIds);
  const collapsedStageIds = new Set(viewState.collapsedStageIds);
  const archivedPlanFrames = renderedPlanFrames.filter(
    (planFrame) => planFrame.collapsed && archivedIdSet.has(planFrame.plan.id)
  );
  const visiblePlanFrames = renderedPlanFrames
    .filter((planFrame) => !archivedIdSet.has(planFrame.plan.id) || !planFrame.collapsed)
    .sort(comparePlanFrames);
  const openPlanCount = renderedPlanFrames.filter((planFrame) => !planFrame.collapsed).length;
  const completedPlanCount = renderedPlanFrames.filter((planFrame) => planFrame.collapsed).length;
  const archivedPlanCount = archivedPlanFrames.length;

  function togglePlan(planFrame: PlanFrame) {
    updateViewState((current) => {
      const key = planFrame.collapsed ? "expandedPlanIds" : "collapsedPlanIds";
      return { ...current, [key]: toggleId(current[key], planFrame.plan.id) };
    });
  }

  function toggleStage(frame: PlannerFrame) {
    updateViewState((current) => {
      const key = frame.collapsed ? "expandedStageIds" : "collapsedStageIds";
      return { ...current, [key]: toggleId(current[key], frame.stage.id) };
    });
  }

  function isPlanCollapsed(planFrame: PlanFrame) {
    return planFrame.collapsed
      ? !expandedPlanIds.has(planFrame.plan.id)
      : collapsedPlanIds.has(planFrame.plan.id);
  }

  function isStageCollapsed(frame: PlannerFrame) {
    return frame.collapsed ? !expandedStageIds.has(frame.stage.id) : collapsedStageIds.has(frame.stage.id);
  }

  function updateViewState(update: (current: PlannerViewState) => PlannerViewState) {
    setViewState((current) => {
      const next = update(current);
      persistPlannerViewState(projectId, next);
      return next;
    });
  }

  function enterEditPlan(planId: string) {
    setEditingPlanId(planId);
    setHasUnsavedChanges(false);
  }

  function exitEditPlan(planId: string) {
    if (
      hasUnsavedChanges &&
      !window.confirm("Discard unsaved changes? Your saved plan will stay unchanged.")
    ) {
      return;
    }

    setEditingPlanId(null);
    setHasUnsavedChanges(false);
    setFocusPlanId(planId);
  }

  return (
    <section className="planner-map stack" aria-label="Plan">
      <ScreenHeader
        title="Plan"
        description="Plans, stages, and nearby work from imported Markdown."
        actions={
          <div className="planner-map__summary" aria-label="Plan summary">
            <span className="planner-map__count">
              <strong>{openPlanCount}</strong>
              <span>open</span>
            </span>
            <span className="planner-map__count">
              <strong>{completedPlanCount}</strong>
              <span>completed</span>
            </span>
            <span className="planner-map__count planner-map__count--archived">
              <strong>{archivedPlanCount}</strong>
              <span>archived</span>
            </span>
          </div>
        }
      />

      <div className="plan-list">
        {visiblePlanFrames.map((planFrame) => {
          const planCollapsed = isPlanCollapsed(planFrame);
          const isEditingPlan = editingPlanId === planFrame.plan.id;
          const planRecommendation = findTask(planFrame, planFrame.recommendedTaskId);
          const planToggleLabel = planCollapsed
            ? planFrame.collapsed
              ? "Show plan"
              : "Expand plan"
            : planFrame.collapsed
              ? "Hide plan"
              : "Collapse plan";

          return (
            <article
              aria-labelledby={`${planFrame.plan.id}-title`}
              className={`plan-frame${planFrame.collapsed ? " plan-frame--collapsed" : ""}${
                planFrame.isCurrent ? " plan-frame--current" : ""
              }${isEditingPlan ? " plan-frame--editing" : ""}`}
              key={planFrame.plan.id}
            >
              <header className="plan-frame__header">
                <div>
                  <p className="stage-frame__status">{planStatusLabel(planFrame)}</p>
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
                  <div className="plan-frame__actions">
                    {!editingPlanId && planRecommendation ? (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Continue plan ${planFrame.plan.title}`}
                        onClick={() =>
                          onOpenTask(planRecommendation.id, {
                            activate: planRecommendation.status !== "done"
                          })
                        }
                      >
                        Continue plan
                      </Button>
                    ) : null}
                    {!editingPlanId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        ref={(button) => {
                          editPlanButtonRefs.current[planFrame.plan.id] = button;
                        }}
                        aria-label={`Edit plan ${planFrame.plan.title}`}
                        onClick={() => enterEditPlan(planFrame.plan.id)}
                      >
                        Edit plan
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      className="planner-map__collapse-button"
                      aria-expanded={!planCollapsed}
                      aria-controls={`${planFrame.plan.id}-content`}
                      aria-label={`${planToggleLabel} ${planFrame.plan.title}`}
                      title={`${planToggleLabel} ${planFrame.plan.title}`}
                      onClick={() => togglePlan(planFrame)}
                    >
                      <CollapseChevron direction={planCollapsed ? "down" : "up"} />
                    </Button>
                    {planFrame.collapsed && onArchivePlan && !isEditingPlan ? (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Hide completed plan ${planFrame.plan.title}`}
                        onClick={() => onArchivePlan(planFrame.plan.id)}
                      >
                        Hide
                      </Button>
                    ) : null}
                  </div>
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
              {isEditingPlan ? (
                <section
                  className="planner-edit-panel"
                  aria-label={`Editing ${planFrame.plan.title}`}
                >
                  <div className="planner-edit-panel__copy">
                    <strong>Edit plan</strong>
                    <p>Changes stay local until you save.</p>
                    <p className="planner-edit-panel__status" role="status">
                      {hasUnsavedChanges ? "Unsaved changes" : "No unsaved changes"}
                    </p>
                  </div>
                  <div className="planner-edit-panel__actions">
                    <Button type="button" disabled={!hasUnsavedChanges}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => exitEditPlan(planFrame.plan.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                </section>
              ) : null}
              {planCollapsed ? (
                <div
                  id={`${planFrame.plan.id}-content`}
                  className="stage-frame__summary plan-frame__summary"
                >
                  <p>
                    {planFrame.stageFrames.length} {pluralize(planFrame.stageFrames.length, "stage")} ·{" "}
                    {planFrame.progress.tasksLabel}
                    {planFrame.progress.checklistLabel
                      ? ` · ${planFrame.progress.checklistLabel}`
                      : ""}
                  </p>
                  {planFrame.isCurrent && planRecommendation ? (
                    <p className="plan-frame__recommendation">
                      Next: <strong>{planRecommendation.title}</strong>
                      {planRecommendation.nextStep ? ` · ${planRecommendation.nextStep}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div id={`${planFrame.plan.id}-content`} className="stage-list">
                  {planFrame.stageFrames.map((frame) =>
                    renderStageFrame(
                      frame,
                      planFrame,
                      isStageCollapsed(frame),
                      () => toggleStage(frame),
                      onOpenTask
                    )
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {archivedPlanFrames.length > 0 ? (
        <>
          <div className="planner-map__archive-divider" aria-hidden="true" />
          <section className="planner-map__archived" aria-label="Hidden completed plans">
            <header className="planner-map__archived-header">
              <div>
                <p className="stage-frame__status">Out of the main flow</p>
                <h2>Hidden completed plans</h2>
              </div>
              <span>{archivedPlanFrames.length}</span>
            </header>
            <div className="planner-map__archived-list">
              {archivedPlanFrames.map((planFrame) => (
                <article className="planner-map__archived-item" key={planFrame.plan.id}>
                  <div>
                    <strong>{planFrame.plan.title}</strong>
                    <span>
                      {planFrame.progress.tasksLabel}
                      {planFrame.progress.checklistLabel
                        ? ` · ${planFrame.progress.checklistLabel}`
                        : ""}
                    </span>
                  </div>
                  {onRestorePlan ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Restore plan ${planFrame.plan.title}`}
                      onClick={() => onRestorePlan(planFrame.plan.id)}
                    >
                      Restore
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function CollapseChevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="planner-map__chevron"
      viewBox="0 0 16 10"
      role="img"
      aria-hidden="true"
    >
      <path
        d={direction === "up" ? "M2 8L8 2L14 8" : "M2 2L8 8L14 2"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function toggleId(current: string[], id: string) {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return [...next];
}

function readCurrentPlannerViewState(projectId?: string) {
  if (!projectId || typeof window === "undefined") {
    return { ...DEFAULT_PLANNER_VIEW_STATE };
  }

  try {
    return readPlannerViewState(window.localStorage, projectId);
  } catch {
    return { ...DEFAULT_PLANNER_VIEW_STATE };
  }
}

function persistPlannerViewState(projectId: string | undefined, state: PlannerViewState) {
  if (!projectId || typeof window === "undefined") {
    return;
  }

  try {
    writePlannerViewState(window.localStorage, projectId, state);
  } catch {
    // Local storage is a best-effort UI preference.
  }
}

function comparePlanFrames(left: PlanFrame, right: PlanFrame) {
  return (
    Number(right.isCurrent) - Number(left.isCurrent) ||
    Number(left.collapsed) - Number(right.collapsed) ||
    left.plan.position - right.plan.position ||
    left.plan.id.localeCompare(right.plan.id)
  );
}

function planStatusLabel(planFrame: PlanFrame) {
  if (planFrame.isCurrent) {
    return "Current working plan";
  }
  return planFrame.collapsed ? "Completed plan" : "Open plan";
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function findTask(planFrame: PlanFrame, taskId: string | null) {
  if (!taskId) {
    return null;
  }

  return (
    planFrame.stageFrames
      .flatMap((frame) => frame.tasks)
      .find((task) => task.id === taskId) ?? null
  );
}

function legacyPlanFrames(frames: PlannerFrame[]): PlanFrame[] {
  if (frames.length === 0) {
    return [];
  }

  const progress = sumProgress(frames);
  const recommendedTaskId =
    frames.find((frame) => frame.recommendedTaskId)?.recommendedTaskId ??
    frames.flatMap((frame) => frame.tasks).find((task) => task.status !== "done")?.id ??
    null;
  const collapsed = frames.every((frame) => frame.stage.status === "completed");

  return [
    {
      plan: {
        id: "legacy-plan",
        projectId: frames[0].stage.projectId,
        title: "Imported plan",
        position: 0
      },
      collapsed,
      isCurrent: !collapsed && recommendedTaskId !== null,
      recommendedTaskId,
      stageFrames: frames,
      progress
    }
  ];
}

function renderStageFrame(
  frame: PlannerFrame,
  planFrame: PlanFrame,
  isCollapsed: boolean,
  onToggle: () => void,
  onOpenTask: PlannerProps["onOpenTask"]
) {
  const planRecommendationInStage = planFrame.isCurrent
    ? frame.tasks.some((task) => task.id === planFrame.recommendedTaskId)
      ? planFrame.recommendedTaskId
      : null
    : null;
  const recommendedTaskId = planRecommendationInStage ?? frame.recommendedTaskId;
  const recommendedTask = frame.tasks.find((task) => task.id === recommendedTaskId) ?? null;
  const stageToggleLabel = isCollapsed ? "Expand stage" : "Collapse stage";

  return (
    <article
      aria-labelledby={`${frame.stage.id}-title`}
      className={`stage-frame stage-frame--${frame.stage.status}${isCollapsed ? " stage-frame--collapsed" : ""}`}
      key={frame.stage.id}
    >
      <header className="stage-frame__header">
        <div>
          <p className="stage-frame__status">{stageStatusLabel(frame.stage.status)}</p>
          <h2 id={`${frame.stage.id}-title`}>{frame.stage.title}</h2>
          {frame.stage.description && !isCollapsed ? (
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
          {frame.progress.checklistLabel ? <span>{frame.progress.checklistLabel}</span> : null}
        </div>
        <div className="stage-frame__header-actions">
          <Button
            type="button"
            variant="ghost"
            className="planner-map__collapse-button"
            aria-expanded={!isCollapsed}
            aria-controls={`${frame.stage.id}-tasks`}
            aria-label={`${stageToggleLabel} ${frame.stage.title}`}
            title={`${stageToggleLabel} ${frame.stage.title}`}
            onClick={onToggle}
          >
            <CollapseChevron direction={isCollapsed ? "down" : "up"} />
          </Button>
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

      {isCollapsed ? (
        <div id={`${frame.stage.id}-tasks`} className="stage-frame__summary">
          <p>
            {frame.progress.tasksLabel}
            {frame.progress.checklistLabel ? ` · ${frame.progress.checklistLabel}` : ""}
          </p>
          {recommendedTask ? renderCompactTask(recommendedTask, onOpenTask) : null}
        </div>
      ) : (
        <div id={`${frame.stage.id}-tasks`} className="task-list">
          {frame.tasks.map((task) => {
            const isRecommended = planFrame.isCurrent && task.id === recommendedTaskId;
            const completedChecklist = task.checklist.filter((item) => item.completed).length;
            const actionLabel = task.status === "done" ? "Open" : "Continue";

            return (
              <div
                className={`task-row${isRecommended ? " task-row--recommended" : ""}`}
                key={task.id}
              >
                <div className="task-row__content">
                  <div className="task-row__title">
                    <span>{task.title}</span>
                    {isRecommended ? <span className="task-row__next-marker">Next</span> : null}
                    <TaskStatusBadge status={task.status} />
                  </div>
                  {task.nextStep ? <p className="task-row__next-step">Next: {task.nextStep}</p> : null}
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

function renderCompactTask(
  task: Task & { checklist: ChecklistItem[] },
  onOpenTask: PlannerProps["onOpenTask"]
) {
  const actionLabel = task.status === "done" ? "Open" : "Continue";

  return (
    <div className="task-row task-row--summary task-row--recommended">
      <div className="task-row__content">
        <div className="task-row__title">
          <span>{task.title}</span>
          <span className="task-row__next-marker">Next</span>
          <TaskStatusBadge status={task.status} />
        </div>
        {task.nextStep ? <p className="task-row__next-step">Next: {task.nextStep}</p> : null}
      </div>
      <Button
        variant="secondary"
        aria-label={`${actionLabel} ${task.title}`}
        onClick={() => onOpenTask(task.id, { activate: task.status !== "done" })}
      >
        {actionLabel}
      </Button>
    </div>
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

function sumProgress(frames: PlannerFrame[]): PlanFrame["progress"] {
  const completedTasks = frames.reduce((sum, frame) => sum + frame.progress.completedTasks, 0);
  const totalTasks = frames.reduce((sum, frame) => sum + frame.progress.totalTasks, 0);
  const completedChecklist = frames.reduce(
    (sum, frame) => sum + frame.progress.completedChecklist,
    0
  );
  const totalChecklist = frames.reduce((sum, frame) => sum + frame.progress.totalChecklist, 0);

  return {
    completedTasks,
    totalTasks,
    completedChecklist,
    totalChecklist,
    percent: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    tasksLabel: `${completedTasks}/${totalTasks} tasks`,
    checklistLabel: totalChecklist > 0 ? `${completedChecklist}/${totalChecklist} checklist` : null
  };
}

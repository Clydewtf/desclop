import type { ResumeBriefView } from "./resumeEngine";
import {
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  Surface
} from "../../shared/ui";

interface TodayProps {
  view: ResumeBriefView;
  onPrimaryAction: () => void;
  onOpenTask?: (taskId: string) => void;
  onStartManualWorkReview?: () => void;
  canUsePrimaryAction?: boolean;
}

export function Today({
  view,
  onPrimaryAction,
  onOpenTask,
  onStartManualWorkReview,
  canUsePrimaryAction = true
}: TodayProps) {
  const statusText = {
    ready: "Ready to continue",
    "no-project": "Project setup",
    "no-plan": "Plan required",
    "no-active-task": "No active task",
    "missing-next-step": "Next action needed"
  }[view.state];

  if (view.state === "no-plan") {
    return (
      <section className="today-view">
        <ScreenHeader eyebrow="Today" title={view.heading} />
        <Surface ariaLabel="Plan required">
          <EmptyState
            title={view.primaryTaskTitle}
            body={view.nextStep}
            action={
              <Button onClick={onPrimaryAction} disabled={!canUsePrimaryAction}>
                {view.primaryActionLabel}
              </Button>
            }
          />
        </Surface>
      </section>
    );
  }

  return (
    <section className="today-view">
      <ScreenHeader eyebrow="Today" title={view.heading} />
      <div className="today-view__grid">
        <Surface ariaLabel="Current task" className="today-current-task">
          <div className="today-current-task__meta">
            <span>{view.stageTitle}</span>
            <span>{statusText}</span>
          </div>
          <div className="today-current-task__content">
            <h2>{view.primaryTaskTitle}</h2>
            {view.latestNote ? <p className="today-current-task__note">{view.latestNote}</p> : null}
          </div>
          {view.state === "missing-next-step" ? (
            <InlineAlert tone="warning">
              <strong>Add the next action before continuing</strong>{" "}
              <span>
                Write one small action so you can resume this task without rereading everything.
              </span>
            </InlineAlert>
          ) : null}
          <div className="today-next-step">
            <strong>Next action</strong>
            <p>{view.nextStep}</p>
          </div>
          <div className="today-current-task__action">
            <Button onClick={onPrimaryAction} disabled={!canUsePrimaryAction}>
              {view.primaryActionLabel}
            </Button>
          </div>
        </Surface>

        <Surface ariaLabel="Recent context" className="today-facts">
          <SectionHeader title="Recent context" />
          {view.facts.length > 0 ? (
            <ul>
              {view.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : (
            <p>No recent context yet.</p>
          )}
        </Surface>

        <Surface ariaLabel="Up next" className="today-next-up">
          <SectionHeader title="Up next" />
          {view.nextTasks.length > 0 ? (
            <ol>
              {view.nextTasks.map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    {task.nextStep ? <span>{task.nextStep}</span> : null}
                  </div>
                  {onOpenTask ? (
                    <Button variant="secondary" onClick={() => onOpenTask(task.id)}>
                      Open {task.title}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p>No nearby tasks.</p>
          )}
        </Surface>
      </div>

      {onStartManualWorkReview ? (
        <Surface ariaLabel="Manual work review" className="today-manual-review">
          <div>
            <h2>Manual work review</h2>
            <p>Record work that happened outside a focus session.</p>
          </div>
          <Button variant="secondary" onClick={onStartManualWorkReview}>
            Add manual work review
          </Button>
        </Surface>
      ) : null}
    </section>
  );
}

import type { ResumeBriefView } from "./resumeEngine";
import type { InboxKind } from "../../shared/domain/types";
import { Button, InlineAlert, ScreenHeader, SectionHeader, Surface } from "../../shared/ui";
import { InboxCapture } from "../inbox/InboxCapture";

interface TodayProps {
  view: ResumeBriefView;
  onPrimaryAction: () => void;
  onCaptureInbox?: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
  onStartManualWorkReview?: () => void;
  canUsePrimaryAction?: boolean;
}

export function Today({
  view,
  onPrimaryAction,
  onCaptureInbox,
  onStartManualWorkReview,
  canUsePrimaryAction = true
}: TodayProps) {
  const statusText = {
    ready: "Ready to continue",
    "no-project": "Project setup",
    "no-plan": "Plan required",
    "no-active-task": "No active task",
    "missing-next-step": "Next step needed"
  }[view.state];

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
            <InlineAlert tone="warning">Set a concrete next step before continuing.</InlineAlert>
          ) : null}
          <div className="today-next-step">
            <strong>Next step</strong>
            <p>{view.nextStep}</p>
          </div>
          <div className="today-current-task__action">
            <Button onClick={onPrimaryAction} disabled={!canUsePrimaryAction}>
              {view.primaryActionLabel}
            </Button>
          </div>
        </Surface>

        {onCaptureInbox ? (
          <Surface ariaLabel="Quick capture" className="today-quick-capture">
            <SectionHeader title="Quick capture" />
            <InboxCapture onCapture={onCaptureInbox} />
          </Surface>
        ) : null}

        <Surface ariaLabel="Resume facts" className="today-facts">
          <SectionHeader title="Resume facts" />
          {view.facts.length > 0 ? (
            <ul>
              {view.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : (
            <p>No recent resume facts.</p>
          )}
        </Surface>

        <Surface ariaLabel="Next up" className="today-next-up">
          <SectionHeader title="Next up" />
          {view.nextTasks.length > 0 ? (
            <ol>
              {view.nextTasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong>
                  {task.nextStep ? <span>{task.nextStep}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p>No upcoming tasks.</p>
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

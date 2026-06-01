import type { ResumeBriefView } from "./resumeEngine";
import type { InboxKind } from "../../shared/domain/types";
import { InboxCapture } from "../inbox/InboxCapture";

interface TodayProps {
  view: ResumeBriefView;
  onContinue: () => void;
  onCaptureInbox?: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
  onStartManualWorkReview?: () => void;
  canContinue?: boolean;
}

export function Today({
  view,
  onContinue,
  onCaptureInbox,
  onStartManualWorkReview,
  canContinue = true
}: TodayProps) {
  return (
    <section className="today-view" aria-labelledby="today-title">
      <h1 id="today-title">{view.heading}</h1>
      <div className="resume-panel">
        <p>{view.stageTitle}</p>
        <h2>{view.primaryTaskTitle}</h2>
        {view.latestNote ? <p>{view.latestNote}</p> : null}
        <strong>Next step</strong>
        <p>{view.nextStep}</p>
        <button type="button" onClick={onContinue} disabled={!canContinue}>
          Continue task
        </button>
        {onStartManualWorkReview ? (
          <button type="button" onClick={onStartManualWorkReview}>
            Add manual work review
          </button>
        ) : null}
      </div>
      {onCaptureInbox ? <InboxCapture onCapture={onCaptureInbox} /> : null}
      <section aria-label="Recent facts">
        {view.facts.map((fact) => (
          <p key={fact}>{fact}</p>
        ))}
      </section>
    </section>
  );
}

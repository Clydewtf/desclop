import type { ResumeBriefView } from "./resumeEngine";

interface TodayProps {
  view: ResumeBriefView;
  onContinue: () => void;
  canContinue?: boolean;
}

export function Today({ view, onContinue, canContinue = true }: TodayProps) {
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
      </div>
      <section aria-label="Recent facts">
        {view.facts.map((fact) => (
          <p key={fact}>{fact}</p>
        ))}
      </section>
    </section>
  );
}

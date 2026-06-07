import { EmptyState, InlineAlert, ScreenHeader, Surface } from "../../shared/ui";

interface TimelineProps {
  facts: string[];
  gitUnavailable: boolean;
  resumeUnavailable: boolean;
}

export function Timeline({ facts, gitUnavailable, resumeUnavailable }: TimelineProps) {
  return (
    <section className="timeline-screen">
      <ScreenHeader
        eyebrow="Review"
        title="Timeline"
        description="Recent project memory from work reviews, notes, inbox facts, and Git context."
      />
      {gitUnavailable ? <InlineAlert tone="warning">Git unavailable.</InlineAlert> : null}
      {resumeUnavailable ? (
        <InlineAlert tone="warning">Resume context unavailable.</InlineAlert>
      ) : null}
      <Surface ariaLabel="Timeline facts">
        {facts.length > 0 ? (
          <ol className="timeline-list">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No timeline facts yet"
            body="Capture notes or save a work review to build project memory."
          />
        )}
      </Surface>
    </section>
  );
}

import type { GitCommit, InboxItem, Note, WorkEntry } from "../../shared/domain/types";
import { EmptyState, ScreenHeader, Surface } from "../../shared/ui";
import { buildTimeline, type TimelineCompletedTask } from "./timelineEngine";

interface TimelineProps {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
  completedTasks: TimelineCompletedTask[];
}

export function Timeline({
  workEntries,
  commits,
  notes,
  inboxItems,
  completedTasks
}: TimelineProps) {
  const timeline = buildTimeline({
    workEntries,
    commits,
    notes,
    inboxItems,
    completedTasks
  });

  return (
    <section className="timeline-screen">
      <ScreenHeader
        eyebrow="Review"
        title="Timeline"
        description={timeline.summary}
      />
      <Surface ariaLabel="Timeline facts">
        {timeline.items.length > 0 ? (
          <ol className="timeline-list">
            {timeline.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <strong>{item.title}</strong>
                <span>{item.kind}</span>
                {item.timestamp ? <time dateTime={item.timestamp}>{item.timestamp}</time> : null}
              </li>
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

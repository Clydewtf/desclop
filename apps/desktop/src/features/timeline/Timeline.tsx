import type { GitCommit, InboxItem, Note, WorkEntry } from "../../shared/domain/types";
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
    <section className="stack" aria-labelledby="timeline-title">
      <header>
        <h1 id="timeline-title">Timeline</h1>
        <p>{timeline.summary}</p>
      </header>
      <div className="stage-list">
        {timeline.items.map((item) => (
          <article className="stage-frame" key={`${item.kind}-${item.id}`}>
            <header>
              <h3>{item.title}</h3>
              <p>{item.kind}</p>
              {item.timestamp ? <time dateTime={item.timestamp}>{item.timestamp}</time> : null}
            </header>
          </article>
        ))}
      </div>
    </section>
  );
}

import type { GitCommit, InboxItem, Note, WorkEntry } from "../../shared/domain/types";
import { EmptyState, ScreenHeader, Surface } from "../../shared/ui";
import { buildTimeline, type TimelineCompletedTask } from "./timelineEngine";

interface TimelineProps {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
  completedTasks: TimelineCompletedTask[];
  now?: Date;
}

export function Timeline({
  workEntries,
  commits,
  notes,
  inboxItems,
  completedTasks,
  now
}: TimelineProps) {
  const timeline = buildTimeline(
    {
      workEntries,
      commits,
      notes,
      inboxItems,
      completedTasks
    },
    now
  );

  return (
    <section className="timeline-screen">
      <ScreenHeader
        eyebrow="Review"
        title="Timeline"
        description={timeline.summary}
      />
      <Surface ariaLabel="Timeline facts">
        {timeline.sections.length > 0 ? (
          <>
            {timeline.sparseState ? (
              <div className="timeline-sparse-note">
                <strong>{timeline.sparseState.title}</strong>
                <p>{timeline.sparseState.body}</p>
              </div>
            ) : null}
            <div className="timeline-groups">
              {timeline.sections.map((section) => (
                <section
                  key={section.id}
                  className="timeline-group"
                  aria-labelledby={`${section.id}-heading`}
                >
                  <h2 id={`${section.id}-heading`}>{section.label}</h2>
                  <ol className="timeline-list">
                    {section.items.map((item) => (
                      <li
                        key={`${item.kind}-${item.id}`}
                        className={`timeline-row timeline-row--${item.kind}`}
                      >
                        <time dateTime={item.timestamp}>{item.time}</time>
                        <span className="timeline-row__type">{item.typeLabel}</span>
                        <div className="timeline-row__content">
                          <strong>{item.title}</strong>
                          {item.metadata ? <span>{item.metadata}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title={timeline.sparseState?.title ?? "No timeline events yet"}
            body={
              timeline.sparseState?.body ??
              "Commits, work reviews, notes, and captures will appear here once there is activity."
            }
          />
        )}
      </Surface>
    </section>
  );
}

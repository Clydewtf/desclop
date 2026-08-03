import { useEffect, useRef, useState } from "react";
import type { GitCommit, InboxItem, Note, WorkEntry } from "../../shared/domain/types";
import { Button, EmptyState, FloatingPanel, ScreenHeader, Surface } from "../../shared/ui";
import { buildTimeline, type TimelineCompletedTask } from "./timelineEngine";

interface TimelineProps {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
  completedTasks: TimelineCompletedTask[];
  dateKey?: string | null;
  focusItemKey?: string | null;
  onClearDateFilter?: () => void;
  now?: Date;
}

export function Timeline({
  workEntries,
  commits,
  notes,
  inboxItems,
  completedTasks,
  dateKey = null,
  focusItemKey = null,
  onClearDateFilter,
  now
}: TimelineProps) {
  const [page, setPage] = useState<number | null>(null);
  const focusedRowRef = useRef<HTMLLIElement | null>(null);
  const timeline = buildTimeline(
    {
      workEntries,
      commits,
      notes,
      inboxItems,
      completedTasks
    },
    now,
    {
      page: page ?? undefined,
      dateKey: dateKey ?? undefined,
      focusItemKey: focusItemKey ?? undefined
    }
  );
  const { pagination } = timeline;

  useEffect(() => {
    setPage(1);
  }, [dateKey, focusItemKey]);

  useEffect(() => {
    if (page === null || page > pagination.page) {
      setPage(pagination.page);
    }
  }, [page, pagination.page]);

  useEffect(() => {
    if (!focusItemKey) {
      return;
    }

    focusedRowRef.current?.scrollIntoView?.({ block: "center" });
  }, [focusItemKey, timeline.sections]);

  return (
    <section className="timeline-screen">
      <ScreenHeader
        eyebrow="Review"
        title="Timeline"
        descriptionKind="summary"
        description={timeline.summary}
      />
      <Surface ariaLabel="Timeline facts">
        {dateKey ? (
          <div className="timeline-filter" role="status">
            <span>
              Showing {timeline.dateFilterLabel ?? dateKey}
              {focusItemKey ? " · selected source record" : ""}
            </span>
            {onClearDateFilter ? (
              <Button variant="secondary" onClick={onClearDateFilter}>
                Show all days
              </Button>
            ) : null}
          </div>
        ) : null}
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
                  <ol className="timeline-list" role="list">
                    {section.items.map((item) => (
                      <li
                        key={`${item.kind}-${item.id}`}
                        ref={(node) => {
                          if (`${item.kind}:${item.id}` === focusItemKey) {
                            focusedRowRef.current = node;
                          }
                        }}
                        className={`timeline-row timeline-row--${item.kind}${
                          `${item.kind}:${item.id}` === focusItemKey
                            ? " timeline-row--focused"
                            : ""
                        }`}
                        data-timeline-item-key={`${item.kind}:${item.id}`}
                        aria-current={
                          `${item.kind}:${item.id}` === focusItemKey ? "location" : undefined
                        }
                      >
                        {item.time && !Number.isNaN(Date.parse(item.timestamp)) ? (
                          <time className="timeline-row__time" dateTime={item.timestamp}>
                            {item.time}
                          </time>
                        ) : (
                          <span className="timeline-row__time" aria-label="Time unavailable">
                            —
                          </span>
                        )}
                        <span className="timeline-row__type">{item.typeLabel}</span>
                        <div className="timeline-row__content">
                          <strong>{item.title}</strong>
                          <TimelineMetadata item={item} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
            {pagination.pageCount > 1 ? (
              <nav className="timeline-pagination" aria-label="Timeline pages">
                <button
                  type="button"
                  onClick={() =>
                    setPage((currentPage) => Math.max(1, (currentPage ?? pagination.page) - 1))
                  }
                  disabled={!pagination.hasPreviousPage}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page} of {pagination.pageCount}
                </span>
                <span className="sr-only" aria-live="polite">
                  Showing timeline page {pagination.page} of {pagination.pageCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((currentPage) =>
                      Math.min(pagination.pageCount, (currentPage ?? pagination.page) + 1)
                    )
                  }
                  disabled={!pagination.hasNextPage}
                  aria-label="Next page"
                >
                  Next
                </button>
              </nav>
            ) : null}
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

type TimelineMetadataItem = ReturnType<typeof buildTimeline>["sections"][number]["items"][number];

function TimelineMetadata({ item }: { item: TimelineMetadataItem }) {
  const changedFiles = item.changedFiles ?? [];

  if (item.kind === "commit" && item.changedFilesLabel) {
    return (
      <span className="timeline-row__metadata">
        {item.metadata ? <span>{item.metadata}</span> : null}
        {item.metadata ? <span aria-hidden="true">·</span> : null}
        <ChangedFilesDisclosure
          files={changedFiles}
          label={item.changedFilesLabel}
          commitId={item.id}
          commitTitle={item.title}
        />
      </span>
    );
  }

  return item.metadata ? <span>{item.metadata}</span> : null;
}

function ChangedFilesDisclosure({
  files,
  label,
  commitId,
  commitTitle
}: {
  files: string[];
  label: string;
  commitId: string;
  commitTitle: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const pointerFocusRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isExpanded = isOpen || isHovered;
  const listId = `timeline-changed-files-${commitId.replace(/[^a-z0-9_-]+/gi, "-")}`;

  return (
    <span
      className="timeline-changed-files"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="timeline-changed-files__trigger"
        aria-expanded={isExpanded}
        aria-controls={listId}
        onPointerDown={() => {
          pointerFocusRef.current = true;
        }}
        onFocus={() => {
          if (!pointerFocusRef.current) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          pointerFocusRef.current = false;
          setIsOpen(false);
        }}
        onClick={() => {
          pointerFocusRef.current = false;
          setIsOpen((currentIsOpen) => !currentIsOpen);
        }}
      >
        {label}
      </button>
      <FloatingPanel
        anchorRef={triggerRef}
        id={listId}
        className="timeline-changed-files__panel"
        role="list"
        aria-label={`Files changed in ${commitTitle}`}
        open={isExpanded}
      >
        {files.length > 0 ? (
          files.map((file) => (
            <span key={file} role="listitem">
              {file}
            </span>
          ))
        ) : (
          <span role="listitem">No file paths recorded</span>
        )}
      </FloatingPanel>
    </span>
  );
}

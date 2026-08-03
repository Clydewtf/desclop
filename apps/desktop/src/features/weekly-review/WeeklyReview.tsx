import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { InboxItem, WorkEntry } from "../../shared/domain/types";
import {
  Button,
  EmptyState,
  HoverTooltip,
  IconButton,
  ScreenHeader,
  SectionHeader,
  Surface
} from "../../shared/ui";
import { formatTimelineDateLabel, formatTimelineTime } from "../../shared/datetime/displayTime";
import type {
  ReviewActivityDay,
  ReviewActivityEvent,
  ReviewActivitySource,
  WeeklyReviewResult
} from "./weeklyReviewEngine";
import { activityHeatmapLevel, WEEKLY_REVIEW_DAYS } from "./weeklyReviewEngine";

export interface WeeklyReviewTimelineTarget {
  dateKey?: string;
  itemKey?: string;
}

interface WeeklyReviewProps {
  review: WeeklyReviewResult;
  hasPlan: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
  onOpenPlan: () => void;
  onOpenImport: () => void;
  onOpenToday: () => void;
  onStartManualWorkReview: (taskId: string | null) => void;
}

export function WeeklyReview({
  review,
  hasPlan,
  onOpenTask,
  onOpenTimeline,
  onOpenPlan,
  onOpenImport,
  onOpenToday,
  onStartManualWorkReview
}: WeeklyReviewProps) {
  const readiness = review.resumeReadiness;
  const hasNoActivity =
    review.activityDays.length === 0 &&
    review.openCaptures.length === 0 &&
    review.completedTasks.length === 0 &&
    review.tasksWithoutNextAction.length === 0 &&
    review.workReviews.length === 0;

  const periodLabel = formatReviewPeriod(review);
  const emptyAction = hasPlan ? (
    <Button variant="secondary" onClick={onOpenPlan}>
      Open Plan
    </Button>
  ) : (
    <Button variant="secondary" onClick={onOpenImport}>
      Import a plan
    </Button>
  );

  return (
    <section className="weekly-review-screen">
      <ScreenHeader
        eyebrow="Review"
        title="Weekly Review"
        descriptionKind="summary"
        description={`Last 7 local days · ${periodLabel}`}
      />

      <Surface ariaLabel="Resume readiness" className="weekly-review__readiness">
        <SectionHeader
          title="Resume readiness"
          action={
            <span className={`weekly-review__status${readiness.ready ? " weekly-review__status--ready" : ""}`}>
              {readiness.ready ? "Ready to resume" : "Needs attention"}
            </span>
          }
        />
        <p className="weekly-review__explanation ui-help-text">
          Resume readiness checks the current task, its next action, and a recent work review.
        </p>
        <ul className="weekly-review__checks">
          <ReadinessCheck
            label="Active task"
            ready={readiness.hasActiveTask}
            detail={readiness.activeTask?.title ?? "Choose an unfinished task from Plan."}
          />
          <ReadinessCheck
            label="Concrete next action"
            ready={readiness.hasNextAction}
            detail={
              readiness.hasNextAction
                ? readiness.activeTask?.nextStep ?? "Next action saved."
                : "Write one small action on the active task."
            }
          />
          <ReadinessCheck
            label="Fresh work review"
            ready={readiness.hasFreshWorkReview}
            detail={
              readiness.hasFreshWorkReview
                ? `${readiness.freshWorkReviews.length} review in this period`
                : "Add a work review for the active task."
            }
          />
        </ul>
        <div className="weekly-review__actions">
          {readiness.ready ? (
            <Button onClick={onOpenToday}>Continue in Today</Button>
          ) : !readiness.hasActiveTask ? (
            <Button onClick={hasPlan ? onOpenPlan : onOpenImport}>
              {hasPlan ? "Pick a task from Plan" : "Import a plan"}
            </Button>
          ) : !readiness.hasNextAction ? (
            <Button onClick={() => onOpenTask(readiness.activeTask!.id)}>
              Open active task
            </Button>
          ) : (
            <Button onClick={() => onStartManualWorkReview(readiness.activeTask!.id)}>
              Add work review
            </Button>
          )}
        </div>
      </Surface>

      <ActivityHeatmap
        review={review}
        onOpenTask={onOpenTask}
        onOpenTimeline={onOpenTimeline}
      />

      {shouldShowLastHandoff(review) ? <LastHandoff review={review} /> : null}

      {hasNoActivity ? (
        <Surface ariaLabel="Review next step">
          <EmptyState
            title={hasPlan ? "No review activity yet" : "No local activity yet"}
            body={
              hasPlan
                ? "Your local review will become useful as you complete a task, capture a thought, or save a work review."
                : "Import a plan, choose a task, and save its next action to make this project resumable."
            }
            action={emptyAction}
          />
        </Surface>
      ) : null}

      <div className="weekly-review__metrics">
        <MetricCard
          title="Completed tasks"
          value={review.completedTasks.length}
          description="Tasks that entered Done inside the review period; historic tasks without a completion date are excluded."
        >
          {review.completedTasks.length > 0 ? (
            <ul className="weekly-review__records">
              {review.completedTasks.map((task) => (
                <li key={task.id}>
                  <div>
                    <RecordTitle value={task.title} />
                    <span>{formatRecordTime(task.completedAt)}</span>
                  </div>
                  <RecordAction label="Open task" onClick={() => onOpenTask(task.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="weekly-review__empty-records">No completed tasks in this period.</p>
          )}
          {review.completedTasksExcludedForMissingDate > 0 ? (
            <p className="weekly-review__data-note">
              {review.completedTasksExcludedForMissingDate} done task(s) have no recorded
              completion date and are omitted from this period count.
            </p>
          ) : null}
        </MetricCard>

        <MetricCard
          title="Open captures"
          value={review.openCaptures.length}
          description="Inbox captures that are still open right now; older captures remain included."
        >
          {review.openCaptures.length > 0 ? (
            <ul className="weekly-review__records">
              {review.openCaptures.map((item) => (
                <CaptureRecord
                  key={item.id}
                  item={item}
                  onOpenTask={onOpenTask}
                  onOpenTimeline={onOpenTimeline}
                />
              ))}
            </ul>
          ) : (
            <p className="weekly-review__empty-records">No open captures right now.</p>
          )}
        </MetricCard>

        <MetricCard
          title="Tasks without next action"
          value={review.tasksWithoutNextAction.length}
          description="Current unfinished tasks whose next action is blank after trimming whitespace."
        >
          {review.tasksWithoutNextAction.length > 0 ? (
            <ul className="weekly-review__records">
              {review.tasksWithoutNextAction.map((task) => (
                <li key={task.id}>
                  <div>
                    <RecordTitle value={task.title} />
                    <span>{task.status === "blocked" ? "Blocked" : "Needs a next action"}</span>
                  </div>
                  <RecordAction label="Open task" onClick={() => onOpenTask(task.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="weekly-review__empty-records">Every unfinished task has a next action.</p>
          )}
        </MetricCard>

        <MetricCard
          title="Work reviews"
          value={review.workReviews.length}
          description="Work review records created inside the review period; duration is not counted."
        >
          {review.workReviews.length > 0 ? (
            <ul className="weekly-review__records">
              {review.workReviews.map((entry) => (
                <WorkReviewRecord
                  key={entry.id}
                  entry={entry}
                  onOpenTask={onOpenTask}
                  onOpenTimeline={onOpenTimeline}
                />
              ))}
            </ul>
          ) : (
            <p className="weekly-review__empty-records">No work reviews in this period.</p>
          )}
        </MetricCard>

      </div>
    </section>
  );
}

function ActivityHeatmap({
  review,
  onOpenTask,
  onOpenTimeline
}: {
  review: WeeklyReviewResult;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const selectedDay = review.activityGrid.find((day) => day.dateKey === selectedDateKey) ?? null;

  return (
    <Surface ariaLabel="Activity heatmap" className="weekly-review__heatmap">
      <SectionHeader
        title="Activity"
        action={
          <span className="weekly-review__heatmap-summary">
            {review.activityDays.length}/{WEEKLY_REVIEW_DAYS} active days
          </span>
        }
      />
      <p className="weekly-review__explanation ui-help-text">
        Local work across the last 7 days. Darker squares mean more recorded actions.
      </p>
      <div className="weekly-review__heatmap-grid" role="list" aria-label="Activity over the last 7 local days">
        {review.activityGrid.map((day) => {
          const activityLabel = formatActivityAriaLabel(day);
          const tooltipLabel = formatActivityTooltip(day);
          const isSelected = selectedDateKey === day.dateKey;
          return (
            <div className="weekly-review__heatmap-day" key={day.dateKey} role="listitem">
              <span className="weekly-review__heatmap-day-label">{formatHeatmapDay(day.date)}</span>
              <HoverTooltip
                className="weekly-review__heatmap-tooltip"
                content={tooltipLabel}
                panelClassName="weekly-review__heatmap-tooltip-panel"
              >
                <button
                  type="button"
                  className={`weekly-review__heatmap-cell weekly-review__heatmap-cell--level-${activityHeatmapLevel(day.count)}`}
                  aria-label={activityLabel}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDateKey(day.dateKey)}
                  onFocus={() => setSelectedDateKey(day.dateKey)}
                  onMouseEnter={() => setSelectedDateKey(day.dateKey)}
                />
              </HoverTooltip>
            </div>
          );
        })}
      </div>
      <div className="weekly-review__heatmap-legend" aria-label="Activity intensity legend">
        <span>Quiet</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            aria-hidden="true"
            className={`weekly-review__heatmap-swatch weekly-review__heatmap-cell--level-${level}`}
            key={level}
          />
        ))}
        <span>Busy</span>
      </div>
      {selectedDay ? (
        <ActivityDayDetails
          day={selectedDay}
          onOpenTask={onOpenTask}
          onOpenTimeline={onOpenTimeline}
        />
      ) : null}
      {!selectedDay ? (
        <p className="weekly-review__heatmap-hint ui-help-text">
          Hover or focus a day to see what happened.
        </p>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => onOpenTimeline(selectedDay ? { dateKey: selectedDay.dateKey } : undefined)}
      >
        Open Timeline
      </Button>
    </Surface>
  );
}

function ActivityDayDetails({
  day,
  onOpenTask,
  onOpenTimeline
}: {
  day: ReviewActivityDay;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
}) {
  return (
    <div className="weekly-review__heatmap-details" aria-live="polite">
      <div className="weekly-review__heatmap-details-header">
        <strong>{formatActivityDay(day.date)}</strong>
        <span>{formatActivityCount(day.count)}</span>
      </div>
      {day.events.length > 0 ? (
        <ul className="weekly-review__heatmap-events">
          {day.events.map((event) => (
            <ActivityEventRow
              event={event}
              dayKey={day.dateKey}
              key={`${event.source}:${event.id}`}
              onOpenTask={onOpenTask}
              onOpenTimeline={onOpenTimeline}
            />
          ))}
        </ul>
      ) : (
        <p className="weekly-review__empty-records">No local activity on this day.</p>
      )}
    </div>
  );
}

function ActivityEventRow({
  event,
  dayKey,
  onOpenTask,
  onOpenTimeline
}: {
  event: ReviewActivityEvent;
  dayKey: string;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
}) {
  const eventMeta = `${activitySourceLabel(event.source)} · ${formatRecordTime(event.timestamp)}`;

  return (
    <li>
      <div>
        <RecordTitle value={event.label} />
        <RecordMeta value={eventMeta} />
      </div>
      {event.taskId ? (
        <RecordAction label="Open task" onClick={() => onOpenTask(event.taskId!)} />
      ) : (
        <RecordAction
          label="Open record"
          onClick={() =>
            onOpenTimeline({ dateKey: dayKey, itemKey: `${event.source}:${event.id}` })
          }
        />
      )}
    </li>
  );
}

function shouldShowLastHandoff(review: WeeklyReviewResult) {
  return Boolean(
    review.lastHandoff.activeTask ||
      review.lastHandoff.latestWorkReview ||
      review.gitStatus.enabled
  );
}

function LastHandoff({ review }: { review: WeeklyReviewResult }) {
  const latestWorkReview = review.lastHandoff.latestWorkReview;
  return (
    <Surface ariaLabel="Last handoff" className="weekly-review__handoff">
      <SectionHeader title="Last handoff" />
      <p className="weekly-review__explanation ui-help-text">
        The latest local work note and the current task’s next action, so you can resume without reconstructing context.
      </p>
      <div className="weekly-review__handoff-grid">
        <div>
          <strong>Latest work review</strong>
          {latestWorkReview ? (
            <>
              <p>{latestWorkReview.done || latestWorkReview.nextStep || "Work reviewed"}</p>
              {latestWorkReview.remains ? <span>Remains: {latestWorkReview.remains}</span> : null}
              {latestWorkReview.nextStep ? <span>Next: {latestWorkReview.nextStep}</span> : null}
              <span>{formatRecordTime(latestWorkReview.createdAt)}</span>
            </>
          ) : (
            <p>No work review recorded yet.</p>
          )}
        </div>
        <div>
          <strong>Current task</strong>
          {review.lastHandoff.activeTask ? (
            <>
              <p>{review.lastHandoff.activeTask.title}</p>
              <span>
                {review.lastHandoff.activeTask.nextStep.trim() || "No next action saved."}
              </span>
            </>
          ) : (
            <p>No active task selected.</p>
          )}
        </div>
      </div>
      {review.gitStatus.enabled ? (
        <p className="weekly-review__data-note">
          Git history: {review.gitStatus.unavailable
            ? review.gitStatus.syncedAt
              ? "unavailable; the last local snapshot is not refreshed."
              : "unavailable; no local snapshot is available."
            : review.gitStatus.syncedAt
              ? `synced ${formatRecordTime(review.gitStatus.syncedAt)}.`
              : "not synced in this session."}
        </p>
      ) : null}
    </Surface>
  );
}

function MetricCard({
  title,
  value,
  description,
  children
}: {
  title: string;
  value: number | string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Surface ariaLabel={title} className="weekly-review__metric">
      <header className="weekly-review__metric-header">
        <h2>{title}</h2>
        <strong aria-label={`${title} value`}>{value}</strong>
      </header>
      <p className="weekly-review__metric-description ui-help-text">{description}</p>
      <details className="weekly-review__metric-details">
        <summary>Show source records</summary>
        {children}
      </details>
    </Surface>
  );
}

function ReadinessCheck({
  label,
  ready,
  detail
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <li className={ready ? "weekly-review__check weekly-review__check--ready" : "weekly-review__check"}>
      <span aria-hidden="true">{ready ? "✓" : "!"}</span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </li>
  );
}

function CaptureRecord({
  item,
  onOpenTask,
  onOpenTimeline
}: {
  item: InboxItem;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
}) {
  const title = firstLine(item.body);

  return (
    <li>
      <div>
        <RecordTitle value={title} />
        <span>{formatRecordTime(item.createdAt)}</span>
      </div>
      {item.taskId ? (
        <RecordAction label="Open task" onClick={() => onOpenTask(item.taskId!)} />
      ) : (
        <RecordAction
          label="Open Timeline"
          onClick={() => onOpenTimeline({ itemKey: `capture:${item.id}` })}
        />
      )}
    </li>
  );
}

function WorkReviewRecord({
  entry,
  onOpenTask,
  onOpenTimeline
}: {
  entry: WorkEntry;
  onOpenTask: (taskId: string) => void;
  onOpenTimeline: (target?: WeeklyReviewTimelineTarget) => void;
}) {
  const title = entry.done || entry.nextStep || "Work reviewed";

  return (
    <li>
      <div>
        <RecordTitle value={title} />
        <span>{formatRecordTime(entry.createdAt)}</span>
      </div>
      {entry.taskId ? (
        <RecordAction label="Open task" onClick={() => onOpenTask(entry.taskId!)} />
      ) : (
        <RecordAction
          label="Open Timeline"
          onClick={() => onOpenTimeline({ itemKey: `work:${entry.id}` })}
        />
      )}
    </li>
  );
}

function RecordTitle({ value }: { value: string }) {
  return (
    <HoverTooltip
      className="weekly-review__record-tooltip-anchor"
      content={value}
      onlyWhenTruncated
      panelClassName="weekly-review__record-tooltip"
    >
      <strong className="weekly-review__record-title">{value}</strong>
    </HoverTooltip>
  );
}

function RecordMeta({ value }: { value: string }) {
  return <span className="weekly-review__record-meta">{value}</span>;
}

function RecordAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <HoverTooltip
      className="weekly-review__record-action-tooltip"
      content={label}
      panelClassName="weekly-review__record-action-tooltip-panel"
    >
      <IconButton
        variant="ghost"
        size="compact"
        className="weekly-review__record-action"
        label={label}
        title=""
        icon={<ChevronRight aria-hidden="true" />}
        onClick={onClick}
      />
    </HoverTooltip>
  );
}

function formatReviewPeriod(review: WeeklyReviewResult) {
  const end = new Date(review.period.end);
  end.setDate(end.getDate() - 1);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${formatter.format(review.period.start)} – ${formatter.format(end)}`;
}

function formatRecordTime(timestamp: string | null | undefined) {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    return "Date unavailable";
  }

  const time = formatTimelineTime(timestamp);
  return time ? `${formatTimelineDateLabel(timestamp)}, ${time}` : formatTimelineDateLabel(timestamp);
}

function formatActivityDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatHeatmapDay(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${weekday} ${date.getDate()}`;
}

function formatActivityAriaLabel(day: ReviewActivityDay) {
  return `${formatActivityTooltip(day)}. Focus or activate to inspect this day's activity.`;
}

function formatActivityTooltip(day: ReviewActivityDay) {
  return `${formatActivityDay(day.date)} · ${formatActivityCount(day.count)}`;
}

function formatActivityCount(count: number) {
  return `${count} ${count === 1 ? "activity" : "activities"}`;
}

function firstLine(value: string) {
  return value.split(/\r?\n/)[0] || value;
}

function activitySourceLabel(source: ReviewActivitySource) {
  const labels: Record<ReviewActivitySource, string> = {
    task: "task completed",
    work: "work review",
    capture: "capture",
    note: "note",
    commit: "commit"
  };
  return labels[source];
}

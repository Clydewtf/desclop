import type {
  GitCommit,
  InboxItem,
  Note,
  Project,
  Task,
  WorkEntry
} from "../../shared/domain/types";

export const WEEKLY_REVIEW_DAYS = 7;

export type ReviewActivitySource = "task" | "work" | "capture" | "note" | "commit";

export type ReviewActivityLevel = 0 | 1 | 2 | 3 | 4;

export interface ReviewPeriod {
  start: Date;
  end: Date;
}

export interface ReviewActivityEvent {
  id: string;
  source: ReviewActivitySource;
  timestamp: string;
  label: string;
  taskId?: string | null;
}

export interface ReviewActivityDay {
  dateKey: string;
  date: Date;
  count: number;
  sources: ReviewActivitySource[];
  events: ReviewActivityEvent[];
}

export interface ResumeReadiness {
  activeTask: Task | null;
  hasActiveTask: boolean;
  hasNextAction: boolean;
  hasFreshWorkReview: boolean;
  freshWorkReviews: WorkEntry[];
  ready: boolean;
}

export interface ReviewGitStatus {
  enabled: boolean;
  unavailable: boolean;
  syncedAt: string | null;
}

export interface ReviewLastHandoff {
  latestWorkReview: WorkEntry | null;
  activeTask: Task | null;
}

export interface WeeklyReviewResult {
  period: ReviewPeriod;
  completedTasks: Task[];
  completedTasksExcludedForMissingDate: number;
  openCaptures: InboxItem[];
  tasksWithoutNextAction: Task[];
  workReviews: WorkEntry[];
  lastHandoff: ReviewLastHandoff;
  gitStatus: ReviewGitStatus;
  activityDays: ReviewActivityDay[];
  activityGrid: ReviewActivityDay[];
  resumeReadiness: ResumeReadiness;
}

export interface WeeklyReviewInput {
  project: Pick<Project, "activeTaskId">;
  tasks: Task[];
  inboxItems: InboxItem[];
  workEntries: WorkEntry[];
  notes: Note[];
  commits: GitCommit[];
  gitStatus?: ReviewGitStatus;
  now?: Date;
}

export function buildWeeklyReview({
  project,
  tasks,
  inboxItems,
  workEntries,
  notes,
  commits,
  gitStatus: gitStatusInput,
  now = new Date()
}: WeeklyReviewInput): WeeklyReviewResult {
  const period = buildReviewPeriod(now);
  const gitStatus: ReviewGitStatus = gitStatusInput ?? {
    enabled: false,
    unavailable: false,
    syncedAt: null
  };
  const completedTasks = tasks
    .filter((task) => task.status === "done" && isWithinPeriod(task.completedAt, period))
    .sort((left, right) =>
      compareTimestamp(right.completedAt, left.completedAt, left.id, right.id)
    );
  const completedTasksExcludedForMissingDate = tasks.filter(
    (task) => task.status === "done" && !isValidTimestamp(task.completedAt)
  ).length;
  const openCaptures = inboxItems
    .filter((item) => item.status === "open")
    .sort((left, right) => compareTimestamp(right.createdAt, left.createdAt, left.id, right.id));
  const tasksWithoutNextAction = tasks
    .filter((task) => task.status !== "done" && !task.nextStep.trim())
    .sort(compareTasks);
  const reviewEntries = workEntries
    .filter((entry) => isWithinPeriod(entry.createdAt, period))
    .sort((left, right) => compareTimestamp(right.createdAt, left.createdAt, left.id, right.id));
  const activeTask =
    tasks.find(
      (task) => task.id === project.activeTaskId && task.status !== "done"
    ) ?? null;
  const freshWorkReviews = activeTask
    ? reviewEntries.filter(
        (entry) => entry.taskId === activeTask.id || entry.taskId === null
      )
    : [];
  const resumeReadiness: ResumeReadiness = {
    activeTask,
    hasActiveTask: activeTask !== null,
    hasNextAction: Boolean(activeTask?.nextStep.trim()),
    hasFreshWorkReview: freshWorkReviews.length > 0,
    freshWorkReviews,
    ready:
      activeTask !== null &&
      Boolean(activeTask.nextStep.trim()) &&
      freshWorkReviews.length > 0
  };
  const lastHandoff: ReviewLastHandoff = {
    latestWorkReview: [...workEntries].sort((left, right) =>
      compareTimestamp(right.createdAt, left.createdAt, left.id, right.id)
    )[0] ?? null,
    activeTask
  };

  const activity = new Map<string, { date: Date; events: ReviewActivityEvent[] }>();
  const addActivity = (
    id: string,
    timestamp: string | null | undefined,
    source: ReviewActivitySource,
    label: string,
    taskId: string | null = null
  ) => {
    const date = parseTimestamp(timestamp);
    if (!date || !isWithinPeriod(timestamp, period)) {
      return;
    }

    const dateKey = localDateKey(date);
    const current = activity.get(dateKey) ?? { date: startOfLocalDay(date), events: [] };
    current.events.push({
      id,
      source,
      timestamp: date.toISOString(),
      label,
      taskId
    });
    activity.set(dateKey, current);
  };

  completedTasks.forEach((task) =>
    addActivity(task.id, task.completedAt, "task", task.title, task.id)
  );
  reviewEntries.forEach((entry) =>
    addActivity(
      entry.id,
      entry.createdAt,
      "work",
      entry.done || entry.nextStep || "Work review",
      entry.taskId
    )
  );
  inboxItems.forEach((item) =>
    addActivity(item.id, item.createdAt, "capture", firstLine(item.body) || "Capture", item.taskId)
  );
  notes.forEach((note) =>
    addActivity(note.id, note.createdAt, "note", firstLine(note.body) || "Note", note.taskId)
  );
  commits.forEach((commit) =>
    addActivity(commit.sha, commit.committedAt, "commit", commit.message || "Commit")
  );

  const activityDays = Array.from(activity.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, value]) => buildActivityDay(dateKey, value));
  const activityGrid = Array.from({ length: WEEKLY_REVIEW_DAYS }, (_, index) => {
    const date = new Date(period.start);
    date.setDate(date.getDate() + index);
    const dateKey = localDateKey(date);
    const value = activity.get(dateKey);
    return value
      ? buildActivityDay(dateKey, value)
      : { dateKey, date, count: 0, sources: [], events: [] };
  });

  return {
    period,
    completedTasks,
    completedTasksExcludedForMissingDate,
    openCaptures,
    tasksWithoutNextAction,
    workReviews: reviewEntries,
    lastHandoff,
    gitStatus,
    activityDays,
    activityGrid,
    resumeReadiness
  };
}

export function activityHeatmapLevel(count: number): ReviewActivityLevel {
  if (count <= 0) {
    return 0;
  }
  if (count <= 1) {
    return 1;
  }
  if (count <= 3) {
    return 2;
  }
  if (count <= 6) {
    return 3;
  }
  return 4;
}

export function buildReviewPeriod(now: Date): ReviewPeriod {
  const today = startOfLocalDay(now);
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKLY_REVIEW_DAYS - 1));
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isWithinPeriod(timestamp: string | null | undefined, period: ReviewPeriod) {
  const date = parseTimestamp(timestamp);
  return date !== null && date >= period.start && date < period.end;
}

function isValidTimestamp(timestamp: string | null | undefined) {
  return parseTimestamp(timestamp) !== null;
}

function parseTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function compareTimestamp(
  leftTimestamp: string | null | undefined,
  rightTimestamp: string | null | undefined,
  leftId: string,
  rightId: string
) {
  const left = parseTimestamp(leftTimestamp)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const right = parseTimestamp(rightTimestamp)?.getTime() ?? Number.NEGATIVE_INFINITY;
  return left - right || leftId.localeCompare(rightId);
}

function compareTasks(left: Task, right: Task) {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function compareActivitySources(left: ReviewActivitySource, right: ReviewActivitySource) {
  const order: ReviewActivitySource[] = ["task", "work", "capture", "note", "commit"];
  return order.indexOf(left) - order.indexOf(right);
}

function buildActivityDay(
  dateKey: string,
  value: { date: Date; events: ReviewActivityEvent[] }
): ReviewActivityDay {
  const events = [...value.events].sort((left, right) =>
    compareTimestamp(right.timestamp, left.timestamp, left.id, right.id)
  );
  const sources = Array.from(new Set(events.map((event) => event.source))).sort(compareActivitySources);
  return {
    dateKey,
    date: value.date,
    count: events.length,
    sources,
    events
  };
}

function firstLine(value: string) {
  return value.split(/\r?\n/)[0] || value;
}

import type { GitCommit, InboxItem, Note, Task, WorkEntry } from "../../shared/domain/types";
import { formatTimelineDateLabel, formatTimelineTime } from "../../shared/datetime/displayTime";

export type TimelineKind = "work" | "commit" | "note" | "capture" | "task";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  typeLabel: string;
  title: string;
  metadata: string;
  changedFiles?: string[];
  changedFilesLabel?: string;
  timestamp: string;
  time: string;
}

export interface TimelineSection {
  id: string;
  label: string;
  items: TimelineItem[];
}

export interface TimelineSparseState {
  title: string;
  body: string;
}

export interface TimelinePagination {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface TimelineOptions {
  page?: number;
  pageSize?: number;
}

export type TimelineCompletedTask = Task & {
  completedAt?: string | null;
  updatedAt?: string | null;
};

export interface TimelineInput {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
  completedTasks: TimelineCompletedTask[];
}

export const DEFAULT_TIMELINE_PAGE_SIZE = 25;

export function buildTimeline(
  input: TimelineInput,
  now = new Date(),
  options: TimelineOptions = {}
) {
  const completedTaskItems = input.completedTasks.flatMap((task) => {
    const timestamp = getCompletedTaskTimestamp(task);
    if (!timestamp) {
      return [];
    }

    return [{
      id: task.id,
      kind: "task" as const,
      typeLabel: "Task",
      title: task.title,
      metadata: "Completed",
      timestamp,
      time: formatTimelineTime(timestamp)
    }];
  });
  const items: TimelineItem[] = [
    ...input.workEntries.map((entry) => ({
      id: entry.id,
      kind: "work" as const,
      typeLabel: "Work review",
      title: entry.done || entry.nextStep || "Work reviewed",
      metadata: formatWorkMetadata(entry),
      timestamp: entry.createdAt,
      time: formatTimelineTime(entry.createdAt)
    })),
    ...input.commits.map((commit) => ({
      id: commit.sha,
      kind: "commit" as const,
      typeLabel: "Commit",
      title: commit.message,
      metadata: `${commit.sha.slice(0, 7)} · ${commit.branch}`,
      changedFiles: commit.changedFiles,
      changedFilesLabel: formatChangedFiles(commit.changedFiles.length),
      timestamp: commit.committedAt,
      time: formatTimelineTime(commit.committedAt)
    })),
    ...input.notes.map((note) => ({
      id: note.id,
      kind: "note" as const,
      typeLabel: "Note",
      title: firstLine(note.body),
      metadata: note.taskId ? "Task note" : "Project note",
      timestamp: note.createdAt,
      time: formatTimelineTime(note.createdAt)
    })),
    ...input.inboxItems.map((item) => ({
      id: item.id,
      kind: "capture" as const,
      typeLabel: "Capture",
      title: firstLine(item.body),
      metadata: `${item.taskId ? "Task" : "Inbox"} · ${inboxKindLabels[item.kind]}`,
      timestamp: item.createdAt,
      time: formatTimelineTime(item.createdAt)
    })),
    ...completedTaskItems
  ].sort(compareTimelineItems);

  const pagination = paginateTimelineItems(items.length, options);
  const visibleItems = items.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize
  );
  const sections: TimelineSection[] = [];
  for (const item of visibleItems) {
    const id = formatTimelineSectionId(item.timestamp);
    const label = formatTimelineDateLabel(item.timestamp, now);
    const currentSection = sections.at(-1);

    if (currentSection?.id === id) {
      currentSection.items.push(item);
    } else {
      sections.push({ id, label, items: [item] });
    }
  }

  const noteCount = input.notes.length + input.inboxItems.length;
  const summaryParts = [
    `${input.commits.length} ${input.commits.length === 1 ? "commit" : "commits"}`,
    input.workEntries.length === 0
      ? "No work reviews"
      : `${input.workEntries.length} work ${input.workEntries.length === 1 ? "review" : "reviews"}`,
    noteCount === 0 ? "No notes" : `${noteCount} ${noteCount === 1 ? "note" : "notes"}`
  ];

  return {
    sections,
    pagination,
    summary: summaryParts.join(" · "),
    sparseState: buildSparseState(input, completedTaskItems.length)
  };
}

function paginateTimelineItems(totalItems: number, options: TimelineOptions): TimelinePagination {
  const pageSize = normalizePositiveInteger(options.pageSize, DEFAULT_TIMELINE_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = normalizePositiveInteger(options.page, 1);
  const page = Math.min(requestedPage, pageCount);

  return {
    page,
    pageCount,
    pageSize,
    totalItems,
    hasPreviousPage: page > 1,
    hasNextPage: page < pageCount
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function compareTimelineItems(a: TimelineItem, b: TimelineItem) {
  const aTime = parseTimelineTimestamp(a.timestamp);
  const bTime = parseTimelineTimestamp(b.timestamp);

  if (aTime !== bTime) {
    return bTime - aTime;
  }

  return `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`);
}

function parseTimelineTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatTimelineSectionId(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "undated";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstLine(value: string) {
  return value.split(/\r?\n/)[0] || value;
}

function formatWorkMetadata(entry: WorkEntry) {
  const source = workEntrySourceLabels[entry.source];
  return entry.durationSeconds ? `${source} · ${Math.round(entry.durationSeconds / 60)} min` : source;
}

function formatChangedFiles(count: number) {
  return `${count} ${count === 1 ? "file" : "files"} changed`;
}

const inboxKindLabels: Record<InboxItem["kind"], string> = {
  untyped: "Untyped",
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  note: "Note",
  task_candidate: "Follow-up"
};

function buildSparseState(
  input: TimelineInput,
  completedTaskCount: number
): TimelineSparseState | null {
  const appEventCount =
    input.workEntries.length + input.notes.length + input.inboxItems.length + completedTaskCount;

  if (input.commits.length > 0 && appEventCount === 0) {
    return {
      title: "Only commits so far",
      body: "Work reviews, notes, and captures will appear here as you use Desclop."
    };
  }

  if (input.commits.length === 0 && appEventCount === 0) {
    return {
      title: "No timeline events yet",
      body: "Commits, work reviews, notes, and captures will appear here once there is activity."
    };
  }

  return null;
}

function getCompletedTaskTimestamp(task: TimelineCompletedTask) {
  for (const timestamp of [task.completedAt, task.updatedAt]) {
    if (timestamp && !Number.isNaN(Date.parse(timestamp))) {
      return timestamp;
    }
  }

  return null;
}

const workEntrySourceLabels: Record<WorkEntry["source"], string> = {
  focus: "Focus session",
  manual: "Manual review",
  status_change: "Status change",
  note: "Note",
  inbox: "Inbox",
  git_recovery: "Git recovery"
};

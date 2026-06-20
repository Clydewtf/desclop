import type { GitCommit, InboxItem, Note, Task, WorkEntry } from "../../shared/domain/types";
import { formatTimelineDateLabel, formatTimelineTime } from "../../shared/datetime/displayTime";

export type TimelineKind = "work" | "commit" | "note" | "capture" | "task";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  typeLabel: string;
  title: string;
  metadata: string;
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

export type TimelineCompletedTask = Task & {
  completedAt?: string | null;
  updatedAt?: string | null;
};

export function buildTimeline(
  input: {
    workEntries: WorkEntry[];
    commits: GitCommit[];
    notes: Note[];
    inboxItems: InboxItem[];
    completedTasks: TimelineCompletedTask[];
  },
  now = new Date()
) {
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
      metadata: `${commit.sha.slice(0, 7)} · ${commit.branch} · ${formatChangedFiles(commit.changedFiles.length)}`,
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
    ...input.completedTasks.map((task) => ({
      id: task.id,
      kind: "task" as const,
      typeLabel: "Task",
      title: task.title,
      metadata: "Completed",
      timestamp: task.completedAt || task.updatedAt || "",
      time: formatTimelineTime(task.completedAt || task.updatedAt || "")
    }))
  ].sort(compareTimelineItems);

  const sections: TimelineSection[] = [];
  for (const item of items) {
    const label = formatTimelineDateLabel(item.timestamp, now);
    const currentSection = sections.at(-1);

    if (currentSection?.label === label) {
      currentSection.items.push(item);
    } else {
      sections.push({ id: label, label, items: [item] });
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
    summary: summaryParts.join(" · "),
    sparseState: buildSparseState(input)
  };
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

function firstLine(value: string) {
  return value.split(/\r?\n/)[0] || value;
}

function formatWorkMetadata(entry: WorkEntry) {
  const source = entry.source === "manual" ? "Manual review" : "Focus session";
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

function buildSparseState(input: {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
}): TimelineSparseState | null {
  const appEventCount = input.workEntries.length + input.notes.length + input.inboxItems.length;

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

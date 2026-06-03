import type { GitCommit, InboxItem, Note, Task, WorkEntry } from "../../shared/domain/types";

export type TimelineKind = "work" | "commit" | "note" | "inbox" | "task";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  timestamp: string;
}

export type TimelineCompletedTask = Task & {
  completedAt?: string | null;
  updatedAt?: string | null;
};

export function buildTimeline(input: {
  workEntries: WorkEntry[];
  commits: GitCommit[];
  notes: Note[];
  inboxItems: InboxItem[];
  completedTasks: TimelineCompletedTask[];
}) {
  const items: TimelineItem[] = [
    ...input.workEntries.map((entry) => ({
      id: entry.id,
      kind: "work" as const,
      title: entry.done || entry.nextStep || "Work entry",
      timestamp: entry.createdAt
    })),
    ...input.commits.map((commit) => ({
      id: commit.sha,
      kind: "commit" as const,
      title: commit.message,
      timestamp: commit.committedAt
    })),
    ...input.notes.map((note) => ({
      id: note.id,
      kind: "note" as const,
      title: note.body,
      timestamp: note.createdAt
    })),
    ...input.inboxItems.map((item) => ({
      id: item.id,
      kind: "inbox" as const,
      title: item.body,
      timestamp: item.createdAt
    })),
    ...input.completedTasks.map((task) => ({
      id: task.id,
      kind: "task" as const,
      title: task.title,
      timestamp: task.completedAt || task.updatedAt || ""
    }))
  ].sort(compareTimelineItems);

  const summaryParts = [
    `${input.workEntries.length} work ${input.workEntries.length === 1 ? "entry" : "entries"}`,
    `${input.commits.length} ${input.commits.length === 1 ? "commit" : "commits"}`,
    `${input.notes.length} ${input.notes.length === 1 ? "note" : "notes"}`
  ];

  return { items, summary: summaryParts.join(", ") };
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

import type { Project, ProjectSummary } from "../../shared/domain/types";

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shortenHomePath(path: string, homePath = "") {
  if (!homePath) {
    return path;
  }

  if (path === homePath) {
    return "~";
  }

  if (path.startsWith(`${homePath}/`)) {
    return `~/${path.slice(homePath.length + 1)}`;
  }

  return path;
}

export function formatUpdatedDate(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Updated date unavailable";
  }

  return `Updated ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date)}`;
}

export function buildProjectMetadataParts(
  project: Project,
  summary: ProjectSummary | undefined,
  homePath = ""
) {
  const parts = [
    shortenHomePath(project.localPath, homePath),
    formatUpdatedDate(project.updatedAt)
  ];

  if (!summary || (summary.taskCount === 0 && summary.openInboxCount === 0)) {
    parts.push("No plan imported");
    return parts;
  }

  parts.push(pluralize(summary.taskCount, "task", "tasks"));
  if (summary.openInboxCount > 0) {
    parts.push(pluralize(summary.openInboxCount, "inbox item", "inbox items"));
  }
  if (summary.activeTaskTitle) {
    parts.push(`Active: ${summary.activeTaskTitle}`);
  }

  return parts;
}

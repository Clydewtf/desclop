import { type ReactNode } from "react";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
type TaskStatus = "todo" | "active" | "blocked" | "done";

const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  active: "Active",
  blocked: "Blocked",
  done: "Done"
};

const taskStatusTones: Record<TaskStatus, BadgeTone> = {
  todo: "neutral",
  active: "accent",
  blocked: "warning",
  done: "success"
};

interface StatusBadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <StatusBadge tone={taskStatusTones[status]}>{taskStatusLabels[status]}</StatusBadge>;
}

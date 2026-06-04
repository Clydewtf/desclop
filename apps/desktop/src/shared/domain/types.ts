export type Id = string;

export type StageStatus = "future" | "current" | "completed";
export type TaskStatus = "todo" | "active" | "blocked" | "done";
export type InboxKind = "untyped" | "bug" | "idea" | "question" | "note" | "task_candidate";
export type InboxStatus = "open" | "attached" | "converted" | "kept_as_note" | "deleted";
export type WorkEntrySource = "focus" | "manual" | "status_change" | "note" | "inbox" | "git_recovery";
export type CommitLinkMode = "focus_interval" | "active_task" | "manual";
export type LicenseState = "free_beta" | "founder" | "trial" | "expired";

export interface Project {
  id: Id;
  name: string;
  localPath: string;
  gitEnabled: boolean;
  gitRemote: string | null;
  activeTaskId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: Id;
  projectId: Id;
  title: string;
  description: string;
  position: number;
  status: StageStatus;
}

export interface Task {
  id: Id;
  projectId: Id;
  stageId: Id;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "low" | "normal" | "high" | null;
  dueDate: string | null;
  nextStep: string;
  position: number;
}

export interface ChecklistItem {
  id: Id;
  taskId: Id;
  title: string;
  completed: boolean;
  position: number;
}

export interface Note {
  id: Id;
  projectId: Id;
  taskId: Id | null;
  body: string;
  createdAt: string;
}

export interface InboxItem {
  id: Id;
  projectId: Id;
  taskId: Id | null;
  body: string;
  kind: InboxKind;
  status: InboxStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkEntry {
  id: Id;
  projectId: Id;
  taskId: Id | null;
  source: WorkEntrySource;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  done: string;
  remains: string;
  nextStep: string;
  createdAt: string;
}

export interface GitCommit {
  sha: string;
  projectId: Id;
  branch: string;
  message: string;
  authorName: string;
  committedAt: string;
  changedFiles: string[];
}

export interface CommitTaskLink {
  id: Id;
  projectId: Id;
  taskId: Id;
  commitSha: string;
  linkMode: CommitLinkMode;
  createdAt: string;
}

export interface ResumeBrief {
  id: Id;
  projectId: Id;
  taskId: Id | null;
  stageId: Id | null;
  latestNote: string;
  nextStep: string;
  facts: string[];
  generatedAt: string;
}

export interface Entitlement {
  id: Id;
  licenseState: LicenseState;
  email: string | null;
  licenseKeyHint: string | null;
  offlineGraceEndsAt: string | null;
  updatedAt: string;
}

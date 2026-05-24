import type {
  ChecklistItem,
  CommitTaskLink,
  GitCommit,
  InboxItem,
  Note,
  Project,
  ResumeBrief,
  Stage,
  Task,
  WorkEntry,
} from "./types";

const now = "2026-05-24T00:00:00.000Z";

export const sampleProject: Project = {
  id: "project_sample",
  name: "Desclop",
  localPath: "/Users/example/projects/desclop",
  gitEnabled: true,
  gitRemote: "git@github.com:example/desclop.git",
  activeTaskId: "task_sample",
  createdAt: now,
  updatedAt: now,
};

export const sampleStage: Stage = {
  id: "stage_sample",
  projectId: sampleProject.id,
  title: "MVP",
  description: "Local-first desktop workflow",
  position: 0,
  status: "current",
};

export const sampleTask: Task = {
  id: "task_sample",
  projectId: sampleProject.id,
  stageId: sampleStage.id,
  title: "Define local store",
  description: "Create the first SQLite schema and shared DTOs.",
  status: "active",
  priority: "normal",
  dueDate: null,
  nextStep: "Wire the schema into app state.",
  position: 0,
};

export const sampleChecklistItem: ChecklistItem = {
  id: "check_sample",
  taskId: sampleTask.id,
  title: "Create migration",
  completed: true,
  position: 0,
};

export const sampleNote: Note = {
  id: "note_sample",
  projectId: sampleProject.id,
  taskId: sampleTask.id,
  body: "Keep MVP git integration read-only.",
  createdAt: now,
};

export const sampleInboxItem: InboxItem = {
  id: "inbox_sample",
  projectId: sampleProject.id,
  taskId: null,
  body: "Capture resume brief facts as JSON.",
  kind: "idea",
  status: "open",
  createdAt: now,
  updatedAt: now,
};

export const sampleWorkEntry: WorkEntry = {
  id: "work_sample",
  projectId: sampleProject.id,
  taskId: sampleTask.id,
  source: "manual",
  startedAt: null,
  endedAt: null,
  durationSeconds: 1800,
  done: "Defined core tables.",
  remains: "Add command bridge.",
  nextStep: "Implement repositories.",
  createdAt: now,
};

export const sampleCommit: GitCommit = {
  sha: "0123456789abcdef",
  projectId: sampleProject.id,
  branch: "main",
  message: "feat: add local project store schema",
  authorName: "Desclop",
  committedAt: now,
  changedFiles: ["apps/desktop/src-tauri/migrations/001_init.sql"],
};

export const sampleCommitTaskLink: CommitTaskLink = {
  id: "commit_link_sample",
  projectId: sampleProject.id,
  taskId: sampleTask.id,
  commitSha: sampleCommit.sha,
  linkMode: "active_task",
  createdAt: now,
};

export const sampleResumeBrief: ResumeBrief = {
  id: "brief_sample",
  projectId: sampleProject.id,
  taskId: sampleTask.id,
  stageId: sampleStage.id,
  latestNote: sampleNote.body,
  nextStep: sampleTask.nextStep,
  facts: ["Desktop-only", "Local-first", "Git read-only in MVP"],
  generatedAt: now,
};

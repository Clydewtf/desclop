import { invoke } from "@tauri-apps/api/core";
import type { ParsedStage } from "../../features/markdown-import/markdownParser";
import type {
  ChecklistItem,
  InboxItem,
  InboxKind,
  Note,
  Project,
  ResumeBrief,
  Stage,
  Task,
  TaskStatus,
  WorkEntry,
  WorkEntrySource
} from "../domain/types";

export interface CreateProjectInput {
  name: string;
  localPath: string;
  gitEnabled: boolean;
}

export interface ProjectPlanPayload {
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}

export interface CaptureInboxItemInput {
  projectId: string;
  body: string;
  kind: InboxKind;
}

export interface AttachInboxItemInput {
  itemId: string;
  taskId: string;
}

export interface ConvertInboxItemInput {
  itemId: string;
  stageId: string;
}

export interface CreateWorkEntryInput {
  projectId: string;
  taskId: string | null;
  source: WorkEntrySource;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  done: string;
  remains: string;
  nextStep: string;
}

export interface GitCommitMetadata {
  sha: string;
  branch: string;
  message: string;
  authorName: string;
  committedAt: string;
  changedFiles: string[];
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input: CreateProjectInput) =>
    invoke<Project>("create_project", { input }),
  loadProjectPlan: (projectId: string) =>
    invoke<ProjectPlanPayload>("load_project_plan", { projectId }),
  importPlan: (projectId: string, stages: ParsedStage[]) =>
    invoke<void>("import_plan", { projectId, stages }),
  updateTaskStatus: (taskId: string, status: TaskStatus) =>
    invoke<void>("update_task_status", { taskId, status }),
  setActiveTask: (projectId: string, taskId: string) =>
    invoke<void>("set_active_task", { projectId, taskId }),
  updateChecklistItem: (itemId: string, completed: boolean) =>
    invoke<void>("update_checklist_item", { itemId, completed }),
  updateNextStep: (taskId: string, nextStep: string) =>
    invoke<void>("update_next_step", { taskId, nextStep }),
  captureInboxItem: (input: CaptureInboxItemInput) =>
    invoke<InboxItem>("capture_inbox_item", { input }),
  attachInboxItemToTask: (input: AttachInboxItemInput) =>
    invoke<InboxItem>("attach_inbox_item_to_task", { input }),
  convertInboxItemToTask: (input: ConvertInboxItemInput) =>
    invoke<Task>("convert_inbox_item_to_task", { input }),
  keepInboxItemAsNote: (itemId: string) =>
    invoke<Note>("keep_inbox_item_as_note", { itemId }),
  deleteInboxItem: (itemId: string) =>
    invoke<InboxItem>("delete_inbox_item", { itemId }),
  addNote: (projectId: string, taskId: string, body: string) =>
    invoke<Note>("add_note", { projectId, taskId, body }),
  listNotesForTask: (projectId: string, taskId: string) =>
    invoke<Note[]>("list_notes_for_task", { projectId, taskId }),
  createWorkEntry: (input: CreateWorkEntryInput) =>
    invoke<WorkEntry>("create_work_entry", { input }),
  listWorkEntriesForTask: (projectId: string, taskId: string) =>
    invoke<WorkEntry[]>("list_work_entries_for_task", { projectId, taskId }),
  getResumeBrief: (projectId: string) =>
    invoke<ResumeBrief>("get_resume_brief", { projectId }),
  readGitCommits: (localPath: string) =>
    invoke<GitCommitMetadata[]>("read_git_commits", { localPath }),
  moveCommitLink: (commitSha: string, fromTaskId: string, toTaskId: string) =>
    invoke<void>("move_commit_link", { commitSha, fromTaskId, toTaskId }),
  unlinkCommit: (commitSha: string, taskId: string) =>
    invoke<void>("unlink_commit", { commitSha, taskId })
};

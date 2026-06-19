import { invoke } from "@tauri-apps/api/core";
import type { ParsedStage } from "../../features/markdown-import/markdownParser";
import type {
  ChecklistItem,
  Entitlement,
  GitCommit,
  InboxItem,
  InboxKind,
  LicenseState,
  Note,
  Project,
  ProjectSummary,
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

export interface SetEntitlementInput {
  licenseState: LicenseState;
  email: string | null;
  licenseKeyHint: string | null;
  offlineGraceEndsAt: string | null;
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  listProjectSummaries: () =>
    invoke<ProjectSummary[]>("list_project_summaries"),
  createProject: (input: CreateProjectInput) =>
    invoke<Project>("create_project", { input }),
  deleteProject: (projectId: string) =>
    invoke<void>("delete_project", { projectId }),
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
  listInboxItemsForProject: (projectId: string) =>
    invoke<InboxItem[]>("list_inbox_items_for_project", { projectId }),
  listInboxItemsForTask: (projectId: string, taskId: string) =>
    invoke<InboxItem[]>("list_inbox_items_for_task", { projectId, taskId }),
  addNote: (projectId: string, taskId: string, body: string) =>
    invoke<Note>("add_note", { projectId, taskId, body }),
  listNotesForProject: (projectId: string) =>
    invoke<Note[]>("list_notes_for_project", { projectId }),
  listNotesForTask: (projectId: string, taskId: string) =>
    invoke<Note[]>("list_notes_for_task", { projectId, taskId }),
  createWorkEntry: (input: CreateWorkEntryInput) =>
    invoke<WorkEntry>("create_work_entry", { input }),
  listWorkEntriesForProject: (projectId: string) =>
    invoke<WorkEntry[]>("list_work_entries_for_project", { projectId }),
  listWorkEntriesForTask: (projectId: string, taskId: string) =>
    invoke<WorkEntry[]>("list_work_entries_for_task", { projectId, taskId }),
  getResumeBrief: (projectId: string) =>
    invoke<ResumeBrief>("get_resume_brief", { projectId }),
  getEntitlement: () => invoke<Entitlement | null>("get_entitlement"),
  setEntitlement: (input: SetEntitlementInput) =>
    invoke<Entitlement>("set_entitlement", { input }),
  readGitCommits: (localPath: string) =>
    invoke<GitCommitMetadata[]>("read_git_commits", { localPath }),
  syncGitCommits: (projectId: string) =>
    invoke<GitCommit[]>("sync_git_commits", { projectId }),
  listLinkedCommitsForTask: (projectId: string, taskId: string) =>
    invoke<GitCommit[]>("list_linked_commits_for_task", { projectId, taskId }),
  moveCommitLink: (commitSha: string, fromTaskId: string, toTaskId: string) =>
    invoke<void>("move_commit_link", { commitSha, fromTaskId, toTaskId }),
  unlinkCommit: (commitSha: string, taskId: string) =>
    invoke<void>("unlink_commit", { commitSha, taskId }),
  exportProjectBundle: (projectId: string, destinationFolder: string) =>
    invoke<string>("export_project_bundle", { projectId, destinationFolder }),
  importProjectBundle: (bundleFolder: string, reselectedLocalPath: string) =>
    invoke<string>("import_project_bundle", { bundleFolder, reselectedLocalPath })
};

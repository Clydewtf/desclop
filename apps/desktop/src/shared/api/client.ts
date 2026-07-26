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
  Plan,
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

export interface ProjectFolderInspection {
  gitRepository: boolean;
}

export interface MarkdownFileReadResult {
  fileName: string;
  text: string;
}

export interface ProjectPlanPayload {
  plans?: Plan[];
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}

export interface UpdatePlanInput {
  planId: string;
  title: string;
}

export interface ReorderPlanInput {
  planId: string;
  position: number;
}

export interface UpdateStageInput {
  stageId: string;
  title: string;
  description: string;
}

export interface ReorderStageInput {
  stageId: string;
  position: number;
}

export interface UpdateTaskInput {
  taskId: string;
  title: string;
  description: string;
}

export interface ReorderTaskInput {
  taskId: string;
  position: number;
}

export interface UpdateChecklistItemDetailsInput {
  itemId: string;
  title: string;
  description: string;
}

export interface ReorderChecklistItemInput {
  itemId: string;
  position: number;
}

export interface CreateTaskInput {
  stageId: string;
  title: string;
  description: string;
  position?: number | null;
}

export interface CreateChecklistItemInput {
  taskId: string;
  title: string;
  description: string;
  position?: number | null;
}

export interface MoveTaskInput {
  taskId: string;
  toStageId: string;
  position?: number | null;
}

export interface DeleteStageInput {
  stageId: string;
}

export interface DeleteTaskInput {
  taskId: string;
  confirmed: boolean;
}

export interface DeleteChecklistItemInput {
  itemId: string;
  confirmed: boolean;
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

export interface DatabaseRuntimeStatus {
  state: "ready" | "recovery_required";
  schemaVersion: number | null;
  targetSchemaVersion: number;
  integrity: "ok" | "failed" | "unavailable" | "recovery_required";
  recoveryCode: string | null;
  recoveryBackupPath: string | null;
  nextStep: string | null;
}

export interface GitDiagnostics {
  configured: boolean;
  repositoryDetected: boolean | null;
}

export interface DatabaseDiagnostics {
  state: string;
  schemaVersion: number | null;
  targetSchemaVersion: number;
  integrity: string;
}

export interface LastBackupDiagnostics {
  state: "none" | "available" | "missing" | "metadata_unavailable";
  kind: string | null;
  createdAt: string | null;
  formatVersion: number | null;
  schemaVersion: number | null;
}

export interface SupportDiagnostics {
  diagnosticFormatVersion: number;
  appVersion: string;
  folderState: string;
  git: GitDiagnostics;
  database: DatabaseDiagnostics;
  lastBackup: LastBackupDiagnostics;
  relinkAvailable: boolean;
}

export interface ProjectDiagnostics {
  appVersion: string;
  projectPath: string;
  folderState: string;
  git: GitDiagnostics;
  database: DatabaseDiagnostics;
  lastBackup: LastBackupDiagnostics;
  relinkAvailable: boolean;
  supportReport: SupportDiagnostics;
}

export interface PortableBackupExportResult {
  path: string;
  exportedAt: string;
  formatVersion: number;
  backupRecorded: boolean;
}

export interface PortableBundlePreview {
  formatVersion: number;
  compatibility: "current" | "legacy_v1";
  projectName: string;
  planCount: number;
  stageCount: number;
  taskCount: number;
  checklistItemCount: number;
  noteCount: number;
  workEntryCount: number;
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  listProjectSummaries: () =>
    invoke<ProjectSummary[]>("list_project_summaries"),
  inspectProjectFolder: (localPath: string) =>
    invoke<ProjectFolderInspection>("inspect_project_folder", { localPath }),
  readMarkdownFile: (filePath: string) =>
    invoke<MarkdownFileReadResult>("read_markdown_file", { filePath }),
  createProject: (input: CreateProjectInput) =>
    invoke<Project>("create_project", { input }),
  deleteProject: (projectId: string) =>
    invoke<void>("delete_project", { projectId }),
  relinkProjectFolder: (projectId: string, localPath: string) =>
    invoke<Project>("relink_project_folder", { projectId, localPath }),
  getDatabaseStatus: () => invoke<DatabaseRuntimeStatus>("get_database_status"),
  getProjectDiagnostics: (projectId: string) =>
    invoke<ProjectDiagnostics>("get_project_diagnostics", { projectId }),
  loadProjectPlan: (projectId: string) =>
    invoke<ProjectPlanPayload>("load_project_plan", { projectId }),
  importPlan: (projectId: string, title: string | null, stages: ParsedStage[]) =>
    invoke<void>("import_plan", { projectId, title, stages }),
  updatePlan: (input: UpdatePlanInput) =>
    invoke<void>("update_plan", { input }),
  reorderPlan: (input: ReorderPlanInput) =>
    invoke<void>("reorder_plan", { input }),
  updateStage: (input: UpdateStageInput) =>
    invoke<void>("update_stage", { input }),
  reorderStage: (input: ReorderStageInput) =>
    invoke<void>("reorder_stage", { input }),
  updateTask: (input: UpdateTaskInput) =>
    invoke<void>("update_task", { input }),
  reorderTask: (input: ReorderTaskInput) =>
    invoke<void>("reorder_task", { input }),
  updateChecklistItemDetails: (input: UpdateChecklistItemDetailsInput) =>
    invoke<void>("update_checklist_item_details", { input }),
  reorderChecklistItem: (input: ReorderChecklistItemInput) =>
    invoke<void>("reorder_checklist_item", { input }),
  createTask: (input: CreateTaskInput) =>
    invoke<Task>("create_task", { input }),
  createChecklistItem: (input: CreateChecklistItemInput) =>
    invoke<ChecklistItem>("create_checklist_item", { input }),
  moveTask: (input: MoveTaskInput) =>
    invoke<void>("move_task", { input }),
  deleteStage: (input: DeleteStageInput) =>
    invoke<void>("delete_stage", { input }),
  deleteTask: (input: DeleteTaskInput) =>
    invoke<void>("delete_task", { input }),
  deleteChecklistItem: (input: DeleteChecklistItemInput) =>
    invoke<void>("delete_checklist_item", { input }),
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
  setCloseBehavior: (behavior: "tray" | "quit") =>
    invoke<void>("set_close_behavior", { behavior }),
  setCaptureShortcut: (shortcut: string) =>
    invoke<void>("set_capture_shortcut", { shortcut }),
  quitApp: () => invoke<void>("quit_app"),
  readGitCommits: (localPath: string) =>
    invoke<GitCommitMetadata[]>("read_git_commits", { localPath }),
  readCurrentGitBranch: (projectId: string) =>
    invoke<string | null>("read_current_git_branch", { projectId }),
  syncGitCommits: (projectId: string) =>
    invoke<GitCommit[]>("sync_git_commits", { projectId }),
  listLinkedCommitsForTask: (projectId: string, taskId: string) =>
    invoke<GitCommit[]>("list_linked_commits_for_task", { projectId, taskId }),
  moveCommitLink: (commitSha: string, fromTaskId: string, toTaskId: string) =>
    invoke<void>("move_commit_link", { commitSha, fromTaskId, toTaskId }),
  unlinkCommit: (commitSha: string, taskId: string) =>
    invoke<void>("unlink_commit", { commitSha, taskId }),
  exportProjectBundle: (projectId: string, destinationFolder: string) =>
    invoke<PortableBackupExportResult>("export_project_bundle", { projectId, destinationFolder }),
  inspectProjectBundle: (bundleFolder: string) =>
    invoke<PortableBundlePreview>("inspect_project_bundle", { bundleFolder }),
  importProjectBundle: (
    bundleFolder: string,
    reselectedLocalPath: string,
    confirmed: boolean
  ) => invoke<string>("import_project_bundle", { bundleFolder, reselectedLocalPath, confirmed })
};

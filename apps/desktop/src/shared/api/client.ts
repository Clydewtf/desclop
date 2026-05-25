import { invoke } from "@tauri-apps/api/core";
import type { ParsedStage } from "../../features/markdown-import/markdownParser";
import type { ChecklistItem, Note, Project, Stage, Task, TaskStatus } from "../domain/types";

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
  addNote: (projectId: string, taskId: string, body: string) =>
    invoke<Note>("add_note", { projectId, taskId, body }),
  listNotesForTask: (projectId: string, taskId: string) =>
    invoke<Note[]>("list_notes_for_task", { projectId, taskId })
};

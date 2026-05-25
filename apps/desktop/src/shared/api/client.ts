import { invoke } from "@tauri-apps/api/core";
import type { ParsedStage } from "../../features/markdown-import/markdownParser";
import type { ChecklistItem, Project, Stage, Task } from "../domain/types";

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
    invoke<void>("import_plan", { projectId, stages })
};

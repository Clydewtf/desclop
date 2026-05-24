import { invoke } from "@tauri-apps/api/core";
import { Project } from "../domain/types";

export interface CreateProjectInput {
  name: string;
  localPath: string;
  gitEnabled: boolean;
}

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input: CreateProjectInput) =>
    invoke<Project>("create_project", { input })
};

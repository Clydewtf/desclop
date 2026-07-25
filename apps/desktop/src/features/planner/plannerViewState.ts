import type { PlannerArchiveStorage } from "./plannerArchive";

export const PLANNER_VIEW_STORAGE_KEY = "desclop.planner-view";
export const PLANNER_VIEW_SCHEMA_VERSION = 1;

export interface PlannerViewState {
  expandedPlanIds: string[];
  collapsedPlanIds: string[];
  expandedStageIds: string[];
  collapsedStageIds: string[];
}

interface PlannerViewRecord {
  schemaVersion: number;
  projects: Record<string, PlannerViewState>;
}

export const DEFAULT_PLANNER_VIEW_STATE: PlannerViewState = {
  expandedPlanIds: [],
  collapsedPlanIds: [],
  expandedStageIds: [],
  collapsedStageIds: []
};

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === "string" && Boolean(id.trim())
      )
    )
  ];
}

function normalizeState(value: unknown): PlannerViewState {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_PLANNER_VIEW_STATE };
  }

  const candidate = value as Record<string, unknown>;
  return {
    expandedPlanIds: normalizeIds(candidate.expandedPlanIds),
    collapsedPlanIds: normalizeIds(candidate.collapsedPlanIds),
    expandedStageIds: normalizeIds(candidate.expandedStageIds),
    collapsedStageIds: normalizeIds(candidate.collapsedStageIds)
  };
}

function readRecord(storage: PlannerArchiveStorage): PlannerViewRecord {
  try {
    const raw = storage.getItem(PLANNER_VIEW_STORAGE_KEY);
    if (!raw) {
      return { schemaVersion: PLANNER_VIEW_SCHEMA_VERSION, projects: {} };
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { schemaVersion: PLANNER_VIEW_SCHEMA_VERSION, projects: {} };
    }

    const projectsValue = "projects" in parsed ? parsed.projects : parsed;
    if (typeof projectsValue !== "object" || projectsValue === null) {
      return { schemaVersion: PLANNER_VIEW_SCHEMA_VERSION, projects: {} };
    }

    const projects: Record<string, PlannerViewState> = {};
    Object.entries(projectsValue).forEach(([projectId, state]) => {
      if (projectId.trim()) {
        projects[projectId] = normalizeState(state);
      }
    });

    return { schemaVersion: PLANNER_VIEW_SCHEMA_VERSION, projects };
  } catch {
    return { schemaVersion: PLANNER_VIEW_SCHEMA_VERSION, projects: {} };
  }
}

export function readPlannerViewState(
  storage: PlannerArchiveStorage,
  projectId: string
) {
  return readRecord(storage).projects[projectId] ?? { ...DEFAULT_PLANNER_VIEW_STATE };
}

export function writePlannerViewState(
  storage: PlannerArchiveStorage,
  projectId: string,
  state: PlannerViewState
) {
  if (!projectId.trim()) {
    return false;
  }

  try {
    const record = readRecord(storage);
    storage.setItem(
      PLANNER_VIEW_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: PLANNER_VIEW_SCHEMA_VERSION,
        projects: {
          ...record.projects,
          [projectId]: normalizeState(state)
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}

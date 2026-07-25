export const PLANNER_ARCHIVE_STORAGE_KEY = "desclop.planner-archive";
export const PLANNER_ARCHIVE_SCHEMA_VERSION = 1;

export interface PlannerArchiveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PlannerArchiveRecord {
  schemaVersion: number;
  projects: Record<string, string[]>;
}

function normalizePlanIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (planId): planId is string =>
          typeof planId === "string" && Boolean(planId.trim())
      )
    )
  ];
}

function readRecord(storage: PlannerArchiveStorage): PlannerArchiveRecord {
  try {
    const raw = storage.getItem(PLANNER_ARCHIVE_STORAGE_KEY);
    if (!raw) {
      return { schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION, projects: {} };
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION, projects: {} };
    }

    const projectsValue = "projects" in parsed ? parsed.projects : parsed;
    if (typeof projectsValue !== "object" || projectsValue === null) {
      return { schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION, projects: {} };
    }

    const projects: Record<string, string[]> = {};
    Object.entries(projectsValue).forEach(([projectId, planIds]) => {
      if (projectId.trim()) {
        projects[projectId] = normalizePlanIds(planIds);
      }
    });

    return { schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION, projects };
  } catch {
    return { schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION, projects: {} };
  }
}

export function readArchivedPlanIds(
  storage: PlannerArchiveStorage,
  projectId: string
) {
  return readRecord(storage).projects[projectId] ?? [];
}

export function writeArchivedPlanIds(
  storage: PlannerArchiveStorage,
  projectId: string,
  planIds: string[]
) {
  if (!projectId.trim()) {
    return false;
  }

  try {
    const record = readRecord(storage);
    const projects = { ...record.projects };
    const normalizedPlanIds = normalizePlanIds(planIds);

    if (normalizedPlanIds.length > 0) {
      projects[projectId] = normalizedPlanIds;
    } else {
      delete projects[projectId];
    }

    storage.setItem(
      PLANNER_ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: PLANNER_ARCHIVE_SCHEMA_VERSION,
        projects
      })
    );
    return true;
  } catch {
    return false;
  }
}

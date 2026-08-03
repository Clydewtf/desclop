export const PLANNER_ARCHIVE_STORAGE_KEY = "desclop.planner-archive";
export const PLANNER_ARCHIVE_SCHEMA_VERSION = 1;
export const PLANNER_ARCHIVE_MIGRATION_STORAGE_KEY =
  "desclop.planner-archive.sqlite-migration";
export const PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION = 1;

export interface PlannerArchiveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PlannerArchiveRecord {
  schemaVersion: number;
  projects: Record<string, string[]>;
}

interface PlannerArchiveMigrationRecord {
  schemaVersion: number;
  projectIds: string[];
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

function readMigrationRecord(storage: PlannerArchiveStorage): PlannerArchiveMigrationRecord {
  try {
    const raw = storage.getItem(PLANNER_ARCHIVE_MIGRATION_STORAGE_KEY);
    if (!raw) {
      return { schemaVersion: PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION, projectIds: [] };
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("projectIds" in parsed)) {
      return { schemaVersion: PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION, projectIds: [] };
    }

    return {
      schemaVersion: PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION,
      projectIds: normalizePlanIds(parsed.projectIds)
    };
  } catch {
    return { schemaVersion: PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION, projectIds: [] };
  }
}

export function readLegacyArchivedPlanIds(
  storage: PlannerArchiveStorage,
  projectId: string
) {
  return readRecord(storage).projects[projectId] ?? [];
}

export function hasLegacyPlanArchiveRecord(storage: PlannerArchiveStorage) {
  try {
    return storage.getItem(PLANNER_ARCHIVE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function hasMigratedLegacyPlanArchives(storage: PlannerArchiveStorage, projectId: string) {
  return readMigrationRecord(storage).projectIds.includes(projectId);
}

export function markLegacyPlanArchivesMigrated(
  storage: PlannerArchiveStorage,
  projectId: string
) {
  if (!projectId.trim()) {
    return false;
  }
  try {
    const record = readMigrationRecord(storage);
    const projectIds = normalizePlanIds([...record.projectIds, projectId]);

    storage.setItem(
      PLANNER_ARCHIVE_MIGRATION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: PLANNER_ARCHIVE_MIGRATION_SCHEMA_VERSION,
        projectIds
      })
    );
    return true;
  } catch {
    return false;
  }
}

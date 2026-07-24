export const LAST_PROJECT_STORAGE_KEY = "desclop.last-project";

export interface ProjectSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function normalizeProjectId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readLastProjectId(storage: ProjectSelectionStorage): string | null {
  try {
    const raw = storage.getItem(LAST_PROJECT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        return normalizeProjectId(parsed);
      }
      if (typeof parsed === "object" && parsed !== null && "projectId" in parsed) {
        return normalizeProjectId(parsed.projectId);
      }
    } catch {
      // Keep the plain string format backward-compatible.
    }

    return normalizeProjectId(raw);
  } catch {
    return null;
  }
}

export function writeLastProjectId(
  storage: ProjectSelectionStorage,
  projectId: string
): boolean {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    return false;
  }

  try {
    storage.setItem(LAST_PROJECT_STORAGE_KEY, normalizedProjectId);
    return true;
  } catch {
    return false;
  }
}

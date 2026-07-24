const knownProjectFolderErrors = new Set([
  "Local folder path is required.",
  "The selected folder does not exist.",
  "The selected path is not a folder.",
  "The selected folder cannot be read."
]);

export const PROJECT_FOLDER_PICKER_ERROR = "Could not open folder picker.";

export function getProjectFolderError(
  error: unknown,
  fallback = "Could not validate the selected folder."
) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";

  return knownProjectFolderErrors.has(message) ? message : fallback;
}

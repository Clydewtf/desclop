let errorReferenceSequence = 0;

function nextReference(prefix: string) {
  errorReferenceSequence += 1;
  const timestamp = Date.now().toString(36).slice(-6).toUpperCase();
  const sequence = errorReferenceSequence.toString(36).toUpperCase();
  return `${prefix}-${timestamp}-${sequence}`;
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

export type SafeErrorCategory = "database" | "filesystem" | "permission" | "unknown";

/** Classifies an error without exposing its original message to the user. */
export function classifyError(error: unknown): SafeErrorCategory {
  const message = errorText(error).toLowerCase();

  if (/sqlite|database|migration|integrity|schema/.test(message)) {
    return "database";
  }
  if (/permission|access denied|forbidden/.test(message)) {
    return "permission";
  }
  if (/folder|directory|path|file|backup|bundle/.test(message)) {
    return "filesystem";
  }

  return "unknown";
}

/**
 * Converts an implementation error into a supportable message without copying
 * paths, SQL details, stack traces, or user content into the UI.
 */
export function formatUserFacingError(subject: string, error: unknown) {
  const reference = nextReference("ERR");
  const category = classifyError(error);
  const recovery =
    category === "database"
      ? "Restart Desclop and use the database recovery instructions if the problem continues."
      : category === "filesystem"
        ? "Check that the selected local folder or backup is available, then try again."
        : category === "permission"
          ? "Check access to the selected local folder, then try again."
          : "Try again. If the problem continues, open Project health and copy the support report.";

  return `${subject} could not be completed. ${recovery} Reference: ${reference}.`;
}

export function createErrorReference(prefix = "UI") {
  return nextReference(prefix);
}

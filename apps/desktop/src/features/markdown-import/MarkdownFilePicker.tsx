import { useCallback, useEffect, useState, type DragEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../../shared/ui";

interface MarkdownFileReadResult {
  fileName: string;
  text: string;
}

interface MarkdownFilePickerProps {
  draft: string;
  fileName?: string | null;
  disabled?: boolean;
  onChooseFile: () => Promise<string | null>;
  onReadFile: (filePath: string) => Promise<MarkdownFileReadResult>;
  onFileLoaded: (file: { name: string; text: string }) => void;
  onError: (message: string) => void;
}

function hasTauriInternals() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).at(-1) ?? "";
}

function isSupportedMarkdownFileName(fileName: string) {
  return /\.(md|markdown|txt)$/i.test(fileName);
}

function getReadError(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const knownErrors = new Set([
    "File selection cancelled. The current draft was kept.",
    "Choose a Markdown file.",
    "The selected Markdown file does not exist.",
    "The selected Markdown path is not a regular file.",
    "Choose a Markdown file with a .md, .markdown, or .txt extension.",
    "The Markdown file is too large. The maximum size is 1 MB.",
    "The Markdown file must use UTF-8 encoding.",
    "The Markdown file is empty. Add Markdown content and try again.",
    "Could not read the selected Markdown file."
  ]);

  return knownErrors.has(message)
    ? message
    : "Could not read the selected Markdown file. Choose another file and try again.";
}

type DragDropPayload = {
  type?: string;
  paths?: string[];
};

function payloadPaths(payload: DragDropPayload | string[]) {
  return Array.isArray(payload) ? payload : Array.isArray(payload.paths) ? payload.paths : [];
}

export function MarkdownFilePicker({
  draft,
  fileName = null,
  disabled = false,
  onChooseFile,
  onReadFile,
  onFileLoaded,
  onError
}: MarkdownFilePickerProps) {
  const [dragActive, setDragActive] = useState(false);

  const loadPath = useCallback(
    async (filePath: string) => {
      const selectedFileName = getFileName(filePath);
      if (!selectedFileName || !isSupportedMarkdownFileName(selectedFileName)) {
        onError("Choose a Markdown file with a .md, .markdown, or .txt extension.");
        return;
      }

      try {
        const file = await onReadFile(filePath);
        if (!file.text.trim()) {
          onError("The Markdown file is empty. Add Markdown content and try again.");
          return;
        }
        if (
          draft.trim() &&
          draft !== file.text &&
          !window.confirm("Replace the current Markdown draft with this file?")
        ) {
          return;
        }

        onFileLoaded({ name: file.fileName || selectedFileName, text: file.text });
      } catch (error) {
        onError(getReadError(error));
      }
    },
    [draft, onError, onFileLoaded, onReadFile]
  );

  const handleNativeDrop = useCallback(
    (paths: string[]) => {
      setDragActive(false);
      if (disabled) {
        return;
      }
      if (paths.length !== 1) {
        onError("Drop one Markdown file at a time.");
        return;
      }
      void loadPath(paths[0]);
    },
    [disabled, loadPath, onError]
  );

  useEffect(() => {
    if (!hasTauriInternals()) {
      return;
    }

    let active = true;
    const unlistenFunctions: Array<() => void> = [];

    function register(eventName: string, handler: (payload: unknown) => void) {
      void listen<unknown>(eventName, (event) => handler(event.payload)).then((unlisten) => {
        if (active) {
          unlistenFunctions.push(unlisten);
        } else {
          unlisten();
        }
      });
    }

    register("tauri://drag-enter", () => {
      if (!disabled) {
        setDragActive(true);
      }
    });
    register("tauri://drag-over", () => {
      if (!disabled) {
        setDragActive(true);
      }
    });
    register("tauri://drag-leave", () => setDragActive(false));
    register("tauri://drag-drop", (payload) => {
      const paths = payloadPaths(
        Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object"
            ? (payload as DragDropPayload)
            : []
      );
      handleNativeDrop(paths);
    });

    return () => {
      active = false;
      unlistenFunctions.forEach((unlisten) => unlisten());
    };
  }, [disabled, handleNativeDrop]);

  async function chooseFile() {
    if (disabled) {
      return;
    }

    try {
      const selectedPath = await onChooseFile();
      if (selectedPath) {
        await loadPath(selectedPath);
      } else {
        onError("File selection cancelled. The current draft was kept.");
      }
    } catch (error) {
      onError(getReadError(error));
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) {
      event.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) {
      setDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (disabled) {
      return;
    }

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path ?? "")
      .filter(Boolean);
    handleNativeDrop(paths);
  }

  return (
    <div
      className={[
        "markdown-import__file-picker",
        dragActive ? "markdown-import__file-picker--drag-active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label="Markdown file drop zone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="markdown-import__file-picker-copy">
        <strong>{fileName ? `Selected file: ${fileName}` : "Import from a file"}</strong>
        <p>
          {fileName
            ? "Choose another file to replace the current draft."
            : "Drop one Markdown file here, or choose a file from your computer. Files up to 1 MB."}
        </p>
      </div>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => void chooseFile()}>
        {fileName ? "Replace file" : "Choose Markdown file"}
      </Button>
    </div>
  );
}

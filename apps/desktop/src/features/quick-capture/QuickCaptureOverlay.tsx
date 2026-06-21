import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";
import type { InboxKind, Task } from "../../shared/domain/types";
import { Button, InlineAlert, SelectField, TextArea } from "../../shared/ui";

const inboxTaskId = "__inbox__";
const dialogTitleId = "quick-capture-title";
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const captureKinds: Array<{ value: InboxKind; label: string }> = [
  { value: "note", label: "Note" },
  { value: "bug", label: "Bug" },
  { value: "question", label: "Question" },
  { value: "task_candidate", label: "Follow-up" },
  { value: "untyped", label: "Untyped" }
];

interface QuickCaptureOverlayProps {
  open: boolean;
  tasks: Task[];
  defaultTaskId: string | null;
  onSave: (input: {
    body: string;
    kind: InboxKind;
    taskId: string | null;
  }) => void | Promise<void>;
  onClose: () => void;
}

export function QuickCaptureOverlay({
  open,
  tasks,
  defaultTaskId,
  onSave,
  onClose
}: QuickCaptureOverlayProps) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<InboxKind>("note");
  const [taskId, setTaskId] = useState(defaultTaskId ?? inboxTaskId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  const sessionRef = useRef(0);
  const savingSessionRef = useRef<number | null>(null);

  function restoreOpenerFocus() {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      opener.focus();
    }
  }

  useEffect(() => {
    if (!open) {
      openRef.current = false;
      return;
    }

    openRef.current = true;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    savingSessionRef.current = null;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBody("");
    setKind("note");
    setTaskId(defaultTaskId ?? inboxTaskId);
    setError(null);
    setSaving(false);

    const focusTimer = window.setTimeout(() => captureRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      openRef.current = false;
      if (sessionRef.current === session) {
        sessionRef.current += 1;
      }
      if (savingSessionRef.current === session) {
        savingSessionRef.current = null;
      }
      restoreOpenerFocus();
    };
  }, [open]);

  function closeCurrentSession() {
    openRef.current = false;
    sessionRef.current += 1;
    savingSessionRef.current = null;
    restoreOpenerFocus();
    onClose();
  }

  async function saveCapture() {
    const trimmedBody = body.trim();
    const session = sessionRef.current;
    if (
      !trimmedBody ||
      !openRef.current ||
      savingSessionRef.current === session
    ) {
      return;
    }

    savingSessionRef.current = session;
    setSaving(true);
    setError(null);

    try {
      await onSave({
        body: trimmedBody,
        kind,
        taskId: taskId === inboxTaskId ? null : taskId
      });
      if (openRef.current && sessionRef.current === session) {
        closeCurrentSession();
      }
    } catch {
      if (openRef.current && sessionRef.current === session) {
        setError("Could not save capture.");
      }
    } finally {
      if (
        openRef.current &&
        sessionRef.current === session &&
        savingSessionRef.current === session
      ) {
        savingSessionRef.current = null;
        setSaving(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCapture();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCurrentSession();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void saveCapture();
      return;
    }

    if (event.key === "Tab") {
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        captureRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="quick-capture-overlay" role="presentation">
      <form
        ref={dialogRef}
        aria-label="Quick capture"
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="quick-capture-dialog"
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        role="dialog"
      >
        <header className="quick-capture-dialog__header">
          <h2 id={dialogTitleId}>Quick capture</h2>
        </header>

        <TextArea
          ref={captureRef}
          id="quick-capture-body"
          label="Capture"
          placeholder="Capture a note, bug, question, or follow-up..."
          value={body}
          disabled={saving}
          onChange={(event) => setBody(event.target.value)}
        />

        <div className="quick-capture-dialog__meta">
          <SelectField
            id="quick-capture-kind"
            label="Type"
            value={kind}
            disabled={saving}
            onChange={(event) => setKind(event.target.value as InboxKind)}
          >
            {captureKinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="quick-capture-task"
            label="Related to"
            value={taskId}
            disabled={saving}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value={inboxTaskId}>No task / Inbox</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </SelectField>
        </div>

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <div className="quick-capture-dialog__actions">
          <Button variant="secondary" disabled={saving} onClick={closeCurrentSession}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Saving capture" : "Save capture"}
          </Button>
        </div>
      </form>
    </div>
  );
}

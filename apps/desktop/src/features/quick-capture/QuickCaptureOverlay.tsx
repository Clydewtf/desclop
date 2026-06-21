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
  const savingRef = useRef(false);
  const captureRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setBody("");
    setKind("note");
    setTaskId(defaultTaskId ?? inboxTaskId);
    setError(null);
    setSaving(false);
    savingRef.current = false;

    const focusTimer = window.setTimeout(() => captureRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [defaultTaskId, open]);

  async function saveCapture() {
    const trimmedBody = body.trim();
    if (!trimmedBody || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await onSave({
        body: trimmedBody,
        kind,
        taskId: taskId === inboxTaskId ? null : taskId
      });
      onClose();
    } catch {
      setError("Could not save capture.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCapture();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void saveCapture();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="quick-capture-overlay" role="presentation">
      <form
        aria-label="Quick capture"
        className="quick-capture-dialog"
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
      >
        <header className="quick-capture-dialog__header">
          <h2>Quick capture</h2>
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
          <Button variant="secondary" disabled={saving} onClick={onClose}>
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

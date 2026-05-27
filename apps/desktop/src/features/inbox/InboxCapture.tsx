import { useState } from "react";
import type { InboxKind } from "../../shared/domain/types";

interface InboxCaptureProps {
  onCapture: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
}

export function InboxCapture({ onCapture }: InboxCaptureProps) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<InboxKind>("untyped");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="inline-capture"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) {
          return;
        }

        const trimmed = body.trim();
        if (trimmed.length === 0) return;

        setSaving(true);
        setError(null);
        try {
          await onCapture({ body: trimmed, kind });
          setBody("");
          setKind("untyped");
        } catch {
          setError("Could not capture inbox item.");
        } finally {
          setSaving(false);
        }
      }}
    >
      {error ? <p role="alert">{error}</p> : null}
      <label>
        Capture
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={saving}
        />
      </label>
      <label>
        Capture type
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as InboxKind)}
          disabled={saving}
        >
          <option value="untyped">Untyped</option>
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="question">Question</option>
          <option value="note">Note</option>
          <option value="task_candidate">Task candidate</option>
        </select>
      </label>
      <button type="submit" disabled={saving}>
        {saving ? "Capturing" : "Capture"}
      </button>
    </form>
  );
}

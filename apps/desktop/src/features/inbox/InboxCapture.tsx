import { useState } from "react";
import type { InboxKind } from "../../shared/domain/types";

interface InboxCaptureProps {
  onCapture: (input: { body: string; kind: InboxKind }) => void;
}

export function InboxCapture({ onCapture }: InboxCaptureProps) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<InboxKind>("untyped");

  return (
    <form
      className="inline-capture"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = body.trim();
        if (trimmed.length === 0) return;
        onCapture({ body: trimmed, kind });
        setBody("");
        setKind("untyped");
      }}
    >
      <label>
        Capture
        <input value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <label>
        Capture type
        <select value={kind} onChange={(event) => setKind(event.target.value as InboxKind)}>
          <option value="untyped">Untyped</option>
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="question">Question</option>
          <option value="note">Note</option>
          <option value="task_candidate">Task candidate</option>
        </select>
      </label>
      <button type="submit">Capture</button>
    </form>
  );
}

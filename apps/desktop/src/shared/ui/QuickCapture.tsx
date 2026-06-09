import { useId, useState } from "react";
import type { InboxKind } from "../domain/types";
import { Button } from "./Button";
import { InlineAlert } from "./InlineAlert";
import { SelectField, TextField } from "./Field";

interface QuickCaptureOption {
  value: InboxKind;
  label: string;
}

interface QuickCaptureProps {
  onCapture: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
  options?: QuickCaptureOption[];
}

export const alphaCaptureOptions: QuickCaptureOption[] = [
  { value: "untyped", label: "Untyped" },
  { value: "note", label: "Note" },
  { value: "question", label: "Question" },
  { value: "task_candidate", label: "Follow-up" }
];

export function QuickCapture({ onCapture, options = alphaCaptureOptions }: QuickCaptureProps) {
  const fieldId = useId();
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
      {error ? <InlineAlert tone="error">Could not capture inbox item.</InlineAlert> : null}
      <TextField
        id={`${fieldId}-body`}
        label="Capture"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={saving}
      />
      <SelectField
        id={`${fieldId}-kind`}
        label="Capture type"
        value={kind}
        onChange={(event) => setKind(event.target.value as InboxKind)}
        disabled={saving}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <Button type="submit" disabled={saving}>
        {saving ? "Capturing" : "Capture"}
      </Button>
    </form>
  );
}

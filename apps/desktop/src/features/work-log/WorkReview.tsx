import { type FormEvent, useState } from "react";

interface WorkReviewProps {
  durationSeconds: number | null;
  onSave: (input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
  }) => void | Promise<void>;
}

export function WorkReview({ durationSeconds, onSave }: WorkReviewProps) {
  const [done, setDone] = useState("");
  const [remains, setRemains] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        done: done.trim(),
        remains: remains.trim(),
        nextStep: nextStep.trim(),
        durationSeconds
      });
    } catch {
      setError("Could not save work review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={saveReview}>
      {error ? <p role="alert">{error}</p> : null}
      {durationSeconds !== null ? (
        <p>{Math.round(durationSeconds / 60)} tracked minutes</p>
      ) : null}
      <label>
        What was done
        <textarea
          value={done}
          onChange={(event) => setDone(event.target.value)}
          disabled={saving}
        />
      </label>
      <label>
        What remains
        <textarea
          value={remains}
          onChange={(event) => setRemains(event.target.value)}
          disabled={saving}
        />
      </label>
      <label>
        Next step
        <textarea
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value)}
          disabled={saving}
        />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? "Saving work review" : "Save work review"}
      </button>
    </form>
  );
}

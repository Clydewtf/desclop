import { type FormEvent, useState } from "react";
import { Button, InlineAlert, ScreenHeader, Surface, TextArea } from "../../shared/ui";

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
    <Surface ariaLabel="Work review" className="work-review">
      <ScreenHeader
        title="Work review"
        description="Capture what changed and the next step before leaving this task."
      />
      <form className="work-review__form" onSubmit={saveReview}>
        {error ? <InlineAlert tone="error">Could not save work review.</InlineAlert> : null}
        {durationSeconds !== null ? (
          <p className="work-review__duration">{Math.round(durationSeconds / 60)} tracked minutes</p>
        ) : null}
        <TextArea
          id="work-review-done"
          label="What was done"
          value={done}
          onChange={(event) => setDone(event.target.value)}
          disabled={saving}
        />
        <TextArea
          id="work-review-remains"
          label="What remains"
          value={remains}
          onChange={(event) => setRemains(event.target.value)}
          disabled={saving}
        />
        <TextArea
          id="work-review-next-step"
          label="Next step"
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value)}
          disabled={saving}
        />
        <Button type="submit" disabled={saving}>
          {saving ? "Saving work review" : "Save work review"}
        </Button>
      </form>
    </Surface>
  );
}

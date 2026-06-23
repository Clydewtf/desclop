import { type FormEvent, useState } from "react";
import { ActionBar, Button, InlineAlert, ScreenHeader, Surface, TextArea } from "../../shared/ui";

interface WorkReviewProps {
  durationSeconds: number | null;
  onSave: (input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
    noMeaningfulProgress: boolean;
  }) => void | Promise<void>;
  onSkip?: (input: { durationSeconds: number | null }) => void | Promise<void>;
}

export function WorkReview({ durationSeconds, onSave, onSkip }: WorkReviewProps) {
  const [done, setDone] = useState("");
  const [remains, setRemains] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [noMeaningfulProgress, setNoMeaningfulProgress] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDone(value: string) {
    setDone(value);
    if (value.trim()) {
      setValidationError(null);
    }
  }

  function updateNoMeaningfulProgress(value: boolean) {
    setNoMeaningfulProgress(value);
    if (value || done.trim()) {
      setValidationError(null);
    }
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }

    if (!done.trim() && !noMeaningfulProgress) {
      setValidationError("Add what changed or choose No meaningful progress.");
      return;
    }

    setSaving(true);
    setError(null);
    setValidationError(null);
    try {
      await onSave({
        done: done.trim(),
        remains: remains.trim(),
        nextStep: nextStep.trim(),
        durationSeconds,
        noMeaningfulProgress
      });
    } catch {
      setError("Could not save work review.");
    } finally {
      setSaving(false);
    }
  }

  async function skipReview() {
    if (saving || !onSkip) {
      return;
    }

    setSaving(true);
    setError(null);
    setValidationError(null);
    try {
      await onSkip({ durationSeconds });
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
        description="Write enough that you can resume without reconstructing the session."
      />
      <form className="work-review__form" onSubmit={saveReview}>
        {error ? <InlineAlert tone="error">Could not save work review.</InlineAlert> : null}
        {validationError ? <InlineAlert tone="warning">{validationError}</InlineAlert> : null}
        {durationSeconds !== null ? (
          <p className="work-review__duration">{Math.round(durationSeconds / 60)} tracked minutes</p>
        ) : null}
        <TextArea
          id="work-review-done"
          label="What changed?"
          value={done}
          onChange={(event) => updateDone(event.target.value)}
          disabled={saving}
        />
        <label className="inline-field">
          <input
            type="checkbox"
            checked={noMeaningfulProgress}
            onChange={(event) => updateNoMeaningfulProgress(event.target.checked)}
            disabled={saving}
          />
          No meaningful progress
        </label>
        <TextArea
          id="work-review-remains"
          label="What remains?"
          value={remains}
          onChange={(event) => setRemains(event.target.value)}
          disabled={saving}
        />
        <TextArea
          id="work-review-next-step"
          label="Next action"
          value={nextStep}
          onChange={(event) => setNextStep(event.target.value)}
          disabled={saving}
        />
        <ActionBar>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving review" : "Save review"}
          </Button>
          {onSkip ? (
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={skipReview}
            >
              Save session without review
            </Button>
          ) : null}
        </ActionBar>
      </form>
    </Surface>
  );
}

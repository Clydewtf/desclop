import { type FormEvent, useState } from "react";

interface WorkReviewProps {
  durationSeconds: number | null;
  onSave: (input: {
    done: string;
    remains: string;
    nextStep: string;
    durationSeconds: number | null;
  }) => void;
}

export function WorkReview({ durationSeconds, onSave }: WorkReviewProps) {
  const [done, setDone] = useState("");
  const [remains, setRemains] = useState("");
  const [nextStep, setNextStep] = useState("");

  function saveReview(event: FormEvent) {
    event.preventDefault();
    onSave({
      done: done.trim(),
      remains: remains.trim(),
      nextStep: nextStep.trim(),
      durationSeconds
    });
  }

  return (
    <form className="stack" onSubmit={saveReview}>
      {durationSeconds !== null ? (
        <p>{Math.round(durationSeconds / 60)} tracked minutes</p>
      ) : null}
      <label>
        What was done
        <textarea value={done} onChange={(event) => setDone(event.target.value)} />
      </label>
      <label>
        What remains
        <textarea value={remains} onChange={(event) => setRemains(event.target.value)} />
      </label>
      <label>
        Next step
        <textarea value={nextStep} onChange={(event) => setNextStep(event.target.value)} />
      </label>
      <button type="submit">Save work review</button>
    </form>
  );
}

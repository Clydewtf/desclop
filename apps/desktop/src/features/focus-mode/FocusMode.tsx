import { type FormEvent, useState } from "react";
import type { ChecklistItem, Task } from "../../shared/domain/types";
import { Button, InlineAlert, SectionHeader, Surface, TextArea } from "../../shared/ui";
import { getFocusTimerState, type FocusModeKind } from "./focusTimer";

interface FocusModeProps {
  task: Task;
  checklist: ChecklistItem[];
  mode: FocusModeKind;
  startedAtMs: number;
  nowMs: number;
  timeboxMinutes: number | null;
  onFinish: (input: { elapsedSeconds: number }) => void;
  onNoteAdd: (body: string) => void | Promise<void>;
  onChecklistToggle: (itemId: string, completed: boolean) => void | Promise<void>;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function FocusMode(props: FocusModeProps) {
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const timer = getFocusTimerState(props);

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (finishing) {
      return;
    }

    const trimmedNote = noteBody.trim();
    if (!trimmedNote) {
      return;
    }

    setFinishing(true);
    setNoteError(null);
    try {
      await props.onNoteAdd(trimmedNote);
      setNoteBody("");
      setNoteComposerOpen(false);
    } catch {
      setNoteError("Could not save task note.");
    } finally {
      setFinishing(false);
    }
  }

  function finishSession() {
    if (finishing) {
      return;
    }

    setFinishing(true);
    props.onFinish({ elapsedSeconds: timer.elapsedSeconds });
  }

  return (
    <section className="focus-mode" aria-labelledby="focus-title">
      <header className="focus-mode__header">
        <div className="focus-mode__task">
          <h1 id="focus-title">{props.task.title}</h1>
          {props.task.nextStep ? <p>{props.task.nextStep}</p> : null}
        </div>
        <div className="focus-mode__timer" aria-label="Focus timer">
          <span>{formatSeconds(timer.elapsedSeconds)}</span>
          {timer.remainingSeconds !== null ? (
            <small>{formatSeconds(timer.remainingSeconds)} remaining</small>
          ) : null}
        </div>
      </header>

      <div className="focus-mode__grid">
        <Surface ariaLabel="Focus checklist" className="focus-mode__checklist">
          <SectionHeader title="Checklist" />
          {props.checklist.length > 0 ? (
            <div className="focus-mode__checklist-items">
              {props.checklist.map((item) => (
                <label className="inline-field" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => props.onChecklistToggle(item.id, event.target.checked)}
                  />
                  {item.title}
                </label>
              ))}
            </div>
          ) : (
            <p className="focus-mode__empty">No checklist items.</p>
          )}
        </Surface>

        <Surface ariaLabel="Focus notes" className="focus-mode__notes">
          <SectionHeader
            title="Task notes"
            action={
              noteComposerOpen ? undefined : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setNoteComposerOpen(true)}
                >
                  Add note
                </Button>
              )
            }
          />
          {noteError ? <InlineAlert tone="error">{noteError}</InlineAlert> : null}
          {noteComposerOpen ? (
            <form className="focus-mode__note-form" onSubmit={saveNote}>
              <TextArea
                id="focus-task-note"
                label="Task note"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                disabled={finishing}
              />
              <div className="focus-mode__note-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={finishing}
                  onClick={() => setNoteComposerOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={finishing || !noteBody.trim()}>
                  Save note
                </Button>
              </div>
            </form>
          ) : (
            <p className="focus-mode__empty">
              Add task notes when something should stay with this task.
            </p>
          )}
          <Button type="button" onClick={finishSession} disabled={finishing}>
            {finishing ? "Finishing session" : "Finish session"}
          </Button>
        </Surface>
      </div>
    </section>
  );
}

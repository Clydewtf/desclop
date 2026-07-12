import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/ui";

const FIRST_RUN_HELP_STORAGE_KEY = "desclop.first-run-help.dismissed";
const FIRST_RUN_HELP_DISMISSED_VALUE = "dismissed";

function hasBeenDismissed() {
  try {
    return window.localStorage.getItem(FIRST_RUN_HELP_STORAGE_KEY) === FIRST_RUN_HELP_DISMISSED_VALUE;
  } catch {
    return false;
  }
}

export function FirstRunHelp() {
  const [visible, setVisible] = useState(() => !hasBeenDismissed());
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (visible) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    }
  }, [visible]);

  function dismiss() {
    try {
      window.localStorage.setItem(
        FIRST_RUN_HELP_STORAGE_KEY,
        FIRST_RUN_HELP_DISMISSED_VALUE
      );
    } catch {
      // The dialog remains dismissible for this session when storage is unavailable.
    }
    setVisible(false);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
    );
    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons.at(-1);
    if (!firstButton || !lastButton) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="first-run-help-overlay" role="presentation">
      <section
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-label="First-run help"
        aria-modal="true"
        className="first-run-help"
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <header className="first-run-help__header">
          <h2>Welcome to Desclop</h2>
          <p id={descriptionId}>
            A quick tour of the places that keep your project moving.
          </p>
        </header>

        <div className="first-run-help__areas">
          <article aria-label="Today" className="first-run-help__area">
            <strong>Today</strong>
            <p>See where you left off and choose the next concrete step.</p>
          </article>
          <article aria-label="Plan" className="first-run-help__area">
            <strong>Plan</strong>
            <p>Organize stages, tasks, and checklists into a working plan.</p>
          </article>
          <article aria-label="Timeline" className="first-run-help__area">
            <strong>Timeline</strong>
            <p>Review commits, notes, and work history over time.</p>
          </article>
          <article aria-label="Capture" className="first-run-help__area">
            <strong>Capture</strong>
            <p>Quickly save a note, question, bug, or follow-up.</p>
          </article>
        </div>

        <div className="first-run-help__actions">
          <Button type="button" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </section>
    </div>
  );
}

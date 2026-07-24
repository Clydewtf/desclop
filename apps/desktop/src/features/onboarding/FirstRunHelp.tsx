import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/ui";
import { CANONICAL_MARKDOWN_TEMPLATE } from "../markdown-import/markdownParser";

const FIRST_RUN_HELP_STORAGE_KEY = "desclop.first-run-help.dismissed";
const FIRST_RUN_HELP_DISMISSED_VALUE = "dismissed";

function hasBeenDismissed() {
  try {
    return window.localStorage.getItem(FIRST_RUN_HELP_STORAGE_KEY) === FIRST_RUN_HELP_DISMISSED_VALUE;
  } catch {
    return false;
  }
}

interface FirstRunHelpProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenPlanImport?: () => void;
}

export function FirstRunHelp({
  open = false,
  onOpenChange,
  onOpenPlanImport
}: FirstRunHelpProps) {
  const [visible, setVisible] = useState(() => !hasBeenDismissed());
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const isVisible = visible || open;

  useEffect(() => {
    if (isVisible) {
      const activeElement = document.activeElement;
      restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-first-run-primary]")
        ?.focus();
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible || !restoreFocusRef.current) {
      return;
    }

    if (restoreFocusRef.current.isConnected) {
      restoreFocusRef.current.focus();
    }
    restoreFocusRef.current = null;
  }, [isVisible]);

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
    onOpenChange?.(false);
  }

  function openPlanImport() {
    dismiss();
    onOpenPlanImport?.();
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

  if (!isVisible) {
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
            A short orientation: choose a folder, add a plan, pick a task, and save its next concrete step.
          </p>
        </header>

        <ol className="first-run-help__path">
          <li><strong>Folder</strong><span>Create a local project from an existing folder.</span></li>
          <li><strong>Plan</strong><span>Import the visible Markdown structure as a new plan.</span></li>
          <li><strong>Task</strong><span>Choose one task and write its next action.</span></li>
        </ol>

        <div className="first-run-help__example">
          <strong>Plan example</strong>
          <pre><code>{CANONICAL_MARKDOWN_TEMPLATE}</code></pre>
        </div>

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
          {onOpenPlanImport ? (
            <Button type="button" variant="secondary" onClick={openPlanImport}>
              Open Import Plan
            </Button>
          ) : null}
          <Button type="button" data-first-run-primary onClick={dismiss}>
            Got it
          </Button>
        </div>
      </section>
    </div>
  );
}

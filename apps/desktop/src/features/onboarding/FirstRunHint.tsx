import { type ReactNode, useState } from "react";
import { Button } from "../../shared/ui";

interface FirstRunHintProps {
  storageKey: string;
  title: string;
  children: ReactNode;
  onOpenHelp?: () => void;
}

function hasBeenDismissed(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "dismissed";
  } catch {
    return false;
  }
}

export function FirstRunHint({ storageKey, title, children, onOpenHelp }: FirstRunHintProps) {
  const [visible, setVisible] = useState(() => !hasBeenDismissed(storageKey));

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // The hint remains dismissible for this session when storage is unavailable.
    }
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <aside className="first-run-hint" aria-label={title}>
      <div className="first-run-hint__content">
        <strong>{title}</strong>
        <div className="first-run-hint__body">{children}</div>
      </div>
      <div className="first-run-hint__actions">
        {onOpenHelp ? (
          <Button type="button" variant="secondary" onClick={onOpenHelp}>
            Help &amp; plan example
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </aside>
  );
}

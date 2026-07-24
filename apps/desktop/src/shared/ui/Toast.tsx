import { GitBranch, X } from "lucide-react";
import { Button } from "./Button";

interface ToastProps {
  title: string;
  message: string;
  onClose: () => void;
}

export function Toast({ title, message, onClose }: ToastProps) {
  return (
    <div className="ui-toast ui-toast--warning" role="status" aria-live="polite">
      <span className="ui-toast__icon" aria-hidden="true">
        <GitBranch />
      </span>
      <div className="ui-toast__content">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="ui-toast__close"
        aria-label={`Dismiss ${title} notification`}
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

import { CheckCircle2, CircleAlert, GitBranch, Info, X } from "lucide-react";
import { Button } from "./Button";

export type ToastTone = "success" | "info" | "warning" | "error";

interface ToastProps {
  title: string;
  message: string;
  onClose: () => void;
  tone?: ToastTone;
}

const toastIcons = {
  success: CheckCircle2,
  info: Info,
  warning: GitBranch,
  error: CircleAlert
};

export function Toast({ title, message, onClose, tone = "warning" }: ToastProps) {
  const Icon = toastIcons[tone];

  return (
    <div className={`ui-toast ui-toast--${tone}`} role="status" aria-live="polite">
      <span className="ui-toast__icon" aria-hidden="true">
        <Icon />
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

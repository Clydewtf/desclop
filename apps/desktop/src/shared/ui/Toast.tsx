import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { IconButton } from "./IconButton";

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
  warning: TriangleAlert,
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
      <IconButton
        type="button"
        variant="ghost"
        size="compact"
        className="ui-toast__close"
        label={`Dismiss ${title} notification`}
        icon={<X aria-hidden="true" />}
        onClick={onClose}
      />
    </div>
  );
}

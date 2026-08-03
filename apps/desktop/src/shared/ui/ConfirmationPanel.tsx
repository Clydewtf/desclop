import { useId, type ReactNode } from "react";

interface ConfirmationPanelProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** An inline, non-modal confirmation block that keeps the user in the current flow. */
export function ConfirmationPanel({
  title,
  description,
  children,
  actions,
  className = ""
}: ConfirmationPanelProps) {
  const titleId = useId();
  const classes = ["ui-confirmation-panel", className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      {description ? <div className="ui-confirmation-panel__description">{description}</div> : null}
      {children}
      {actions ? <div className="ui-confirmation-panel__actions">{actions}</div> : null}
    </section>
  );
}

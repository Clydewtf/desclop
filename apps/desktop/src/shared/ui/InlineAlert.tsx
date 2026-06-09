import { type ReactNode } from "react";

type InlineAlertTone = "info" | "warning" | "error";

interface InlineAlertProps {
  tone: InlineAlertTone;
  children: ReactNode;
}

export function InlineAlert({ tone, children }: InlineAlertProps) {
  return (
    <div className={`ui-inline-alert ui-inline-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

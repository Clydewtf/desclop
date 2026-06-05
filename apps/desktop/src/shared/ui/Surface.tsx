import { type ReactNode } from "react";

interface SurfaceProps {
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function Surface({ children, ariaLabel, className = "" }: SurfaceProps) {
  const classes = ["ui-surface", className].filter(Boolean).join(" ");

  return (
    <article className={classes} aria-label={ariaLabel}>
      {children}
    </article>
  );
}

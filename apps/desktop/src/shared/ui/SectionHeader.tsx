import { type ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <header className="ui-section-header">
      <h2>{title}</h2>
      {action ? <div className="ui-section-header__action">{action}</div> : null}
    </header>
  );
}

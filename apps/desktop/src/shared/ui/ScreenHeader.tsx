import { type ReactNode } from "react";

interface ScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function ScreenHeader({ eyebrow, title, description, actions }: ScreenHeaderProps) {
  return (
    <header className="ui-screen-header">
      <div className="ui-screen-header__content">
        {eyebrow ? <p className="ui-screen-header__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-screen-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-screen-header__actions">{actions}</div> : null}
    </header>
  );
}

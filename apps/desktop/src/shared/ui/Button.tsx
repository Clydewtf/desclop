import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  icon,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    icon ? "ui-button--with-icon" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type={type} {...props}>
      {icon ? (
        <span className="ui-button__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-button__label">{children}</span>
    </button>
  );
}

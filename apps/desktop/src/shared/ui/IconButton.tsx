import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ButtonVariant } from "./Button";

export type IconButtonSize = "default" | "compact";

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: IconButtonSize;
}

/** A named compact control for one unambiguous icon action. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = "ghost",
    size = "default",
    className = "",
    title,
    type = "button",
    ...props
  },
  ref
) {
  const classes = [
    "ui-icon-button",
    `ui-icon-button--${variant}`,
    `ui-icon-button--${size}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} className={classes} type={type} aria-label={label} title={title ?? label} {...props}>
      <span className="ui-icon-button__icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
});

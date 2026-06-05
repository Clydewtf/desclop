import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  hintId?: string;
  children: ReactNode;
}

function FieldFrame({ id, label, hint, hintId, children }: FieldFrameProps) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <span className="ui-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function mergeDescribedBy(ariaDescribedBy: string | undefined, hintId: string | undefined) {
  return [ariaDescribedBy, hintId].filter(Boolean).join(" ") || undefined;
}

export function TextField({
  id,
  label,
  hint,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <FieldFrame id={id} label={label} hint={hint} hintId={hintId}>
      <input
        id={id}
        className={["ui-input", className].filter(Boolean).join(" ")}
        aria-describedby={mergeDescribedBy(ariaDescribedBy, hintId)}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextArea({
  id,
  label,
  hint,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; label: string; hint?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <FieldFrame id={id} label={label} hint={hint} hintId={hintId}>
      <textarea
        id={id}
        className={["ui-textarea", className].filter(Boolean).join(" ")}
        aria-describedby={mergeDescribedBy(ariaDescribedBy, hintId)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  hint,
  children,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string; hint?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <FieldFrame id={id} label={label} hint={hint} hintId={hintId}>
      <select
        id={id}
        className={["ui-select", className].filter(Boolean).join(" ")}
        aria-describedby={mergeDescribedBy(ariaDescribedBy, hintId)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

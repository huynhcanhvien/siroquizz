"use client";

import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const CONTROL_BASE =
  "w-full rounded-md border border-border bg-surface-2 px-3.5 text-text placeholder:text-subtle " +
  "transition-[border-color,background-color,box-shadow] duration-150 " +
  "hover:border-border-strong focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/15 " +
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/15 disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL_BASE, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL_BASE, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(CONTROL_BASE, "h-11 cursor-pointer appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-text", className)} {...props} />;
}

export function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} role="alert" className="text-sm font-medium text-danger">
        {error}
      </p>
    );
  }
  if (!hint) return null;
  return (
    <p id={id} className="text-sm text-muted">
      {hint}
    </p>
  );
}

interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: (control: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Wires label, hint and error message to a single form control. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || hint);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": hasMessage ? messageId : undefined })}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

interface PasswordInputProps extends Omit<ComponentProps<"input">, "type"> {
  showLabel: string;
  hideLabel: string;
}

export function PasswordInput({ showLabel, hideLabel, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-muted hover:bg-surface-3 hover:text-text"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function Checkbox({ className, label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4.5 shrink-0 cursor-pointer rounded accent-[var(--primary)]"
        {...props}
      />
      <label htmlFor={props.id ?? id} className="cursor-pointer text-sm leading-snug text-muted">
        {label}
      </label>
    </div>
  );
}

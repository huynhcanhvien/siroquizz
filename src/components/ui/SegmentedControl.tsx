"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  className?: string;
  hideLabel?: boolean;
}

/** Radio group styled as a segmented pill. Native radios keep keyboard support for free. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hideLabel = false,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn("mb-1.5 text-sm font-semibold", hideLabel && "sr-only")}>{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold whitespace-nowrap text-muted transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--ring)]",
              value === option.value ? "bg-surface text-text shadow-sm" : "hover:text-text",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.icon}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

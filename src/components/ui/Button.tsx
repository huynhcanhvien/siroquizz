import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary:
    "bg-primary text-on-primary shadow-[0_3px_0_var(--primary-press)] hover:bg-primary-hover active:translate-y-[2px] active:shadow-[0_1px_0_var(--primary-press)]",
  accent:
    "bg-accent text-on-accent shadow-[0_3px_0_var(--accent-strong)] hover:brightness-[1.04] active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-strong)]",
  secondary:
    "border border-border-strong bg-surface text-text shadow-[0_2px_0_var(--border-strong)] hover:bg-surface-2 active:translate-y-[2px] active:shadow-none",
  soft: "bg-primary-soft text-primary-text hover:brightness-[0.97] dark:hover:brightness-110",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  danger:
    "bg-danger text-white shadow-[0_3px_0_color-mix(in_oklch,var(--danger)_65%,black)] hover:brightness-110 active:translate-y-[2px] active:shadow-none",
} as const;

const SIZES = {
  sm: "h-9 gap-1.5 rounded-md px-3 text-sm",
  md: "h-11 gap-2 rounded-md px-4.5 text-[0.95rem]",
  lg: "h-13 gap-2.5 rounded-lg px-6 text-base",
  icon: "size-10 rounded-md",
  "icon-sm": "size-8 rounded-sm",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
}

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center font-semibold whitespace-nowrap select-none",
    "transition-[background-color,box-shadow,transform,filter,color] duration-150 ease-out",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = buttonClasses(variant, size, className);

  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

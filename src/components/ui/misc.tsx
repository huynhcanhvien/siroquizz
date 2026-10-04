import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const BADGE_TONES = {
  neutral: "bg-surface-3 text-muted",
  primary: "bg-primary-soft text-primary-text",
  accent: "bg-accent-soft text-on-accent dark:text-accent",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof BADGE_TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  tone?: "primary" | "success" | "accent";
  className?: string;
}

const BAR_TONES = { primary: "bg-primary", success: "bg-success", accent: "bg-accent" } as const;

export function ProgressBar({ value, max, label, tone = "primary", className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div
        className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-out", BAR_TONES[tone])}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

const AVATAR_BG: Record<string, string> = {
  indigo: "bg-[oklch(55%_0.2_268)]",
  amber: "bg-[oklch(70%_0.16_65)]",
  emerald: "bg-[oklch(58%_0.14_160)]",
  rose: "bg-[oklch(60%_0.19_10)]",
  sky: "bg-[oklch(60%_0.13_230)]",
  violet: "bg-[oklch(55%_0.2_300)]",
};

export function avatarBackground(color: string): string {
  return AVATAR_BG[color] ?? AVATAR_BG.indigo;
}

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const sizes = { sm: "size-8 text-sm", md: "size-10 text-base", lg: "size-16 text-2xl" };
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-white shadow-[inset_0_-3px_0_oklch(0%_0_0/0.15)]",
        avatarBackground(color),
        sizes[size],
      )}
    >
      {initial}
    </span>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-on-accent dark:text-accent [&_svg]:size-7">
        {icon}
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      {body ? <p className="max-w-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Surface({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-sm", className)} {...props} />;
}

interface LogoProps {
  className?: string;
  withWordmark?: boolean;
  wordmarkClassName?: string;
}

export function Logo({ className, withWordmark = true, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span aria-hidden className="relative grid size-8 place-items-center">
        <span className="absolute inset-0 translate-x-[3px] translate-y-[3px] rotate-6 rounded-[0.55rem] bg-accent" />
        <span className="relative grid size-8 place-items-center rounded-[0.55rem] bg-primary text-[0.95rem] text-on-primary">
          S
        </span>
      </span>
      {withWordmark ? (
        <span className={cn("text-lg", wordmarkClassName)}>
          Siro<span className="text-primary-text">Quizz</span>
        </span>
      ) : null}
    </span>
  );
}

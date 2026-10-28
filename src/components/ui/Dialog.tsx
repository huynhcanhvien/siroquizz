"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Slides in from an edge as a drawer instead of opening centred. */
  side?: "right" | "bottom";
}

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" } as const;
const CENTERED =
  "top-1/2 left-1/2 max-h-[min(90dvh,52rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl data-[state=open]:animate-pop";
const SIDES = {
  right: "inset-y-0 right-0 h-dvh w-[min(26rem,100vw)] rounded-l-xl data-[state=open]:animate-[rise_200ms_ease-out]",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-xl data-[state=open]:animate-[rise_200ms_ease-out]",
} as const;

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  side,
}: DialogProps) {
  const t = useTranslations("common");
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[rise_200ms_ease-out]" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex flex-col border border-border bg-surface shadow-lg",
            side ? SIDES[side] : [CENTERED, SIZES[size]],
          )}
        >
          <header className="flex items-start gap-4 px-6 pt-6 pb-2">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-xl font-bold tracking-tight">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("close")}>
                <X className="size-4" aria-hidden />
              </Button>
            </RadixDialog.Close>
          </header>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div> : null}
          {footer ? <footer className="flex flex-wrap justify-end gap-2 px-6 pt-2 pb-6">{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  onConfirm: () => void;
  tone?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = "danger",
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

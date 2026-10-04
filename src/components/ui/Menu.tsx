"use client";

import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, sideOffset = 8, align = "end", ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-52 rounded-lg border border-border bg-surface p-1.5 shadow-lg data-[state=open]:animate-pop",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, tone, ...props }: ComponentProps<typeof DropdownMenu.Item> & { tone?: "danger" }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none select-none",
        "data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        tone === "danger" && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("px-2.5 py-1.5 text-xs font-semibold text-subtle uppercase", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none select-none data-[highlighted]:bg-surface-2",
        "data-[state=checked]:text-primary-text [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <span className="grid size-4 place-items-center">
        <DropdownMenu.ItemIndicator>
          <span className="block size-2 rounded-full bg-primary" />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.RadioItem>
  );
}

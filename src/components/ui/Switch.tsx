"use client";

import { Switch as RadixSwitch } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-primary"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[1.375rem]" />
      </RadixSwitch.Root>
      <label htmlFor={id} className="cursor-pointer text-sm font-semibold">
        {label}
      </label>
    </div>
  );
}

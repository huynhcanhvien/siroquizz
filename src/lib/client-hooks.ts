"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const subscribeNoop = () => () => undefined;

/** Reads a browser-only value without hydration mismatches (server render uses `serverValue`). */
export function useClientValue<T>(getSnapshot: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNoop, getSnapshot, () => serverValue);
}

/** True only after hydration. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}

/** Calls `callback` the first time `done` becomes true (games use it to report a finished round once). */
export function useOnceWhen(done: boolean, callback: () => void): void {
  const firedRef = useRef(false);
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    if (!done || firedRef.current) return;
    firedRef.current = true;
    callbackRef.current();
  }, [done]);
}

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ACTIVATABLE_SELECTOR = "button, a[href], summary, [role=button], [role=menuitem], input, select, textarea";

/** True when the key event comes from a text field, where global shortcuts must not fire. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || TEXT_ENTRY_TAGS.has(target.tagName));
}

/** True when Space/Enter would activate the focused control, so a global shortcut must yield. */
export function isActivatableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ACTIVATABLE_SELECTOR) !== null;
}

/**
 * After a click disables or hides the focused control (a matched tile, a used letter),
 * move focus to the first usable control in `container` so keyboard users aren't dropped to <body>.
 */
export function refocusWithin(container: HTMLElement | null, selector = "button:not([disabled]):not(.invisible)"): void {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    const usable = active instanceof HTMLElement && container?.contains(active) && !active.matches(":disabled, .invisible");
    if (!usable) container?.querySelector<HTMLElement>(selector)?.focus();
  });
}

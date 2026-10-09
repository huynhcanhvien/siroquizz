"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import { createStorage, getBrowserStorage, storageKey } from "@/lib/storage";
import type { Side } from "@/lib/types";

const sideSchema = z.enum(["term", "definition"]);
const changeEvent = "siroquizz:phonetic-side-change";
// Keep the control usable across navigation when browser storage is blocked or full.
const sessionValues = new Map<string, Side>();
const defaultSide = (): Side => "term";

/** A null set ID disables the preference for sessions that merge multiple sets. */
export function useSetPhoneticSide(setId: string | null) {
  const name = setId === null ? null : `phonetic-side:${setId}`;
  const getSnapshot = useCallback(
    (): Side =>
      name === null
        ? "term"
        : (sessionValues.get(name) ?? getBrowserStorage().readValue(name, sideSchema) ?? "term"),
    [name],
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (name === null) return () => undefined;
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === name) onChange();
      };
      const onStorageChange = (event: StorageEvent) => {
        if (event.key !== null && event.key !== storageKey(name)) return;
        // Ignore changes to sessionStorage and accept test events without a storageArea.
        if (event.storageArea !== null) {
          try {
            if (event.storageArea !== window.localStorage) return;
          } catch {
            return;
          }
        }
        sessionValues.delete(name);
        onChange();
      };
      window.addEventListener(changeEvent, onLocalChange);
      window.addEventListener("storage", onStorageChange);
      return () => {
        window.removeEventListener(changeEvent, onLocalChange);
        window.removeEventListener("storage", onStorageChange);
      };
    },
    [name],
  );
  const phoneticSide = useSyncExternalStore(subscribe, getSnapshot, defaultSide);
  const setPhoneticSide = useCallback(
    (side: Side) => {
      if (name === null) return;
      try {
        // Access directly so denied access throws instead of silently using a null backend.
        createStorage(window.localStorage).writeValue(name, side);
        sessionValues.delete(name);
      } catch {
        sessionValues.set(name, side);
      }
      window.dispatchEvent(new CustomEvent(changeEvent, { detail: name }));
    },
    [name],
  );

  return { phoneticSide, setPhoneticSide };
}

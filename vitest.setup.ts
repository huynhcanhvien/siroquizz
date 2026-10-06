import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks ResizeObserver, which Radix primitives (e.g. Switch) use to measure themselves.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

afterEach(() => {
  cleanup();
  // Tests that opt into the node environment have no browser storage.
  if (typeof window === "undefined") return;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

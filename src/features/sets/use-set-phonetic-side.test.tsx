import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storageKey } from "@/lib/storage";
import { useSetPhoneticSide } from "./use-set-phonetic-side";

const key = (id: string) => storageKey(`phonetic-side:${id}`);

afterEach(() => vi.restoreAllMocks());

describe("useSetPhoneticSide", () => {
  it("shares changes across consumers, persists on remount and isolates sets", () => {
    const first = renderHook(() => useSetPhoneticSide("shared"));
    const second = renderHook(() => useSetPhoneticSide("shared"));
    const other = renderHook(() => useSetPhoneticSide("other"));
    expect(first.result.current.phoneticSide).toBe("term");

    act(() => first.result.current.setPhoneticSide("definition"));
    expect(second.result.current.phoneticSide).toBe("definition");
    expect(other.result.current.phoneticSide).toBe("term");
    expect(window.localStorage.getItem(key("shared"))).toBe('"definition"');
    first.unmount();
    second.unmount();
    const remounted = renderHook(() => useSetPhoneticSide("shared"));
    expect(remounted.result.current.phoneticSide).toBe("definition");
  });

  it.each(['"invalid"', "not json", "null"])("defaults to term for invalid storage: %s", (raw) => {
    window.localStorage.setItem(key("invalid"), raw);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useSetPhoneticSide("invalid"));
    expect(result.current.phoneticSide).toBe("term");
  });

  it("follows changes and deletion from another tab, including clearing storage", () => {
    const { result } = renderHook(() => useSetPhoneticSide("tabs"));
    act(() => {
      window.localStorage.setItem(key("tabs"), '"definition"');
      window.dispatchEvent(
        new StorageEvent("storage", { key: key("tabs"), storageArea: window.localStorage }),
      );
    });
    expect(result.current.phoneticSide).toBe("definition");
    act(() => {
      window.localStorage.removeItem(key("tabs"));
      window.dispatchEvent(new StorageEvent("storage", { key: key("tabs") }));
    });
    expect(result.current.phoneticSide).toBe("term");
    act(() => result.current.setPhoneticSide("definition"));
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.phoneticSide).toBe("term");
  });

  it("keeps changes in memory when writes fail, including after navigation", () => {
    const { result, unmount } = renderHook(() => useSetPhoneticSide("full"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    act(() => result.current.setPhoneticSide("definition"));
    expect(result.current.phoneticSide).toBe("definition");
    unmount();
    const remounted = renderHook(() => useSetPhoneticSide("full"));
    expect(remounted.result.current.phoneticSide).toBe("definition");
    act(() => remounted.result.current.setPhoneticSide("term"));
    expect(remounted.result.current.phoneticSide).toBe("term");
  });

  it("keeps working when access to localStorage is denied", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    const { result } = renderHook(() => useSetPhoneticSide("blocked"));
    expect(result.current.phoneticSide).toBe("term");
    act(() => result.current.setPhoneticSide("definition"));
    expect(result.current.phoneticSide).toBe("definition");
  });

  it("reads the new set's preference when the set ID changes", () => {
    window.localStorage.setItem(key("saved"), '"definition"');
    const { result, rerender } = renderHook(({ id }) => useSetPhoneticSide(id), {
      initialProps: { id: "saved" },
    });
    expect(result.current.phoneticSide).toBe("definition");
    rerender({ id: "fresh" });
    expect(result.current.phoneticSide).toBe("term");
  });

  it("uses term during server rendering and disables preferences for merged sessions", () => {
    window.localStorage.setItem(key("server"), '"definition"');
    function ServerProbe() {
      return <span>{useSetPhoneticSide("server").phoneticSide}</span>;
    }
    expect(renderToString(<ServerProbe />)).toBe("<span>term</span>");
    const { result } = renderHook(() => useSetPhoneticSide(null));
    act(() => result.current.setPhoneticSide("definition"));
    expect(result.current.phoneticSide).toBe("term");
  });
});

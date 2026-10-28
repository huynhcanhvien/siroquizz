import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LONG_REQUEST_TIMEOUT_MS, apiId, collectPages, createHttpClient } from "./http-client";

const schema = z.object({ id: z.string() });
const success = (data: unknown, meta?: unknown) =>
  Response.json({ success: true, data, ...(meta ? { meta } : {}) });

describe("HTTP transport", () => {
  it("uses same-origin cookie auth, disables caching and refuses redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(success({ id: "1" }));
    expect(await createHttpClient(fetcher).request("/api/v1/sets/1", schema)).toEqual({
      data: { id: "1" },
      nextCursor: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/sets/1",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("waits up to 55s for AI requests and 15s for everything else", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => success({ id: "1" }));
    const client = createHttpClient(fetcher);
    await client.request("/api/v1/ai/phonetics", schema, { method: "POST", body: {} });
    await client.request("/api/v1/sets/1", schema);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([LONG_REQUEST_TIMEOUT_MS, 15_000]);
    expect(LONG_REQUEST_TIMEOUT_MS).toBe(55_000);
    timeout.mockRestore();
  });
  it.each([
    [503, "AI_UNAVAILABLE"],
    [503, "STORAGE_UNAVAILABLE"],
    [400, "INVALID_FILE"],
    [400, "PDF_PAGE_LIMIT"],
  ])("preserves actionable AI error %s/%s", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: false, error: { code } }, { status }));
    await expect(
      createHttpClient(fetcher).request("/api/v1/ai/jobs", schema),
    ).rejects.toMatchObject({ code });
  });
  it("serializes write payloads and sends JSON headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(success(null));
    await createHttpClient(fetcher).request("/api/v1/sets", z.null(), {
      method: "POST",
      body: { title: "中文" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/sets",
      expect.objectContaining({
        method: "POST",
        body: '{"title":"中文"}',
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      }),
    );
  });
  it.each([
    "https://evil.example/api/v1/sets",
    "//evil.example/api/v1/sets",
    "/api/v1/sets\\evil",
    "/api/v1/sets\n",
    "/api/v1/sets#other",
    "/api/v1/../auth",
    "/api/v1/%2e%2e/auth",
  ])("rejects unsafe path %j before fetch", async (path) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createHttpClient(fetcher).request(path, schema)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [400, "VALIDATION"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
    [500, "UNKNOWN"],
  ])("maps a non-JSON %s response to %s", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("internal secret stack trace", { status }));
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code,
      message: code,
    });
  });
  it.each([
    "VALIDATION_ERROR",
    "VALIDATION",
    "INVALID_CREDENTIALS",
    "EMAIL_TAKEN",
    "RATE_LIMITED",
    "FORBIDDEN",
    "CONFLICT",
    "INTERNAL",
    "UNRECOGNIZED",
    "constructor",
    "__proto__",
  ])("maps API code %s without leaking its message", async (code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { success: false, error: { code, message: "private-secret" } },
          { status: 400 },
        ),
      );
    const expected =
      code === "INTERNAL"
        ? "UNKNOWN"
        : ["VALIDATION_ERROR", "UNRECOGNIZED", "constructor", "__proto__"].includes(code)
          ? "VALIDATION"
          : code;
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code: expected,
      message: expected,
    });
  });
  it("treats 401 as expired session even if an envelope says otherwise", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ success: false, error: { code: "INTERNAL" } }, { status: 401 }),
      );
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
  it.each([
    {},
    { success: true, data: { id: 2 } },
    { success: true, data: null },
    { success: false, error: { code: "INTERNAL" } },
    { success: true, data: { id: "1" }, meta: { nextCursor: "" } },
  ])("rejects malformed successful response %j", async (data) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(data));
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });
  it("rejects non-JSON successful responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html/>"));
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });
  it("maps network/timeout failures without exposing fetch details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret hostname"));
    await expect(createHttpClient(fetcher).request("/api/v1/sets", schema)).rejects.toMatchObject({
      code: "NETWORK",
      message: "NETWORK",
    });
  });
});

describe("cursor pagination and IDs", () => {
  it("collects pages and preserves existing query filters", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(success([{ id: "1" }], { nextCursor: "a/b+c" }))
      .mockResolvedValueOnce(success([{ id: "2" }], { nextCursor: null }));
    expect(
      await collectPages(createHttpClient(fetcher), "/api/v1/sets?source=ai", z.array(schema)),
    ).toEqual([{ id: "1" }, { id: "2" }]);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/sets?source=ai&limit=50&cursor=a%2Fb%2Bc");
  });
  it("accepts an empty last page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(success([]));
    expect(await collectPages(createHttpClient(fetcher), "/api/v1/sets", z.array(schema))).toEqual(
      [],
    );
  });
  it("rejects repeating cursors instead of looping", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => success([], { nextCursor: "repeated" }));
    await expect(
      collectPages(createHttpClient(fetcher), "/api/v1/sets", z.array(schema)),
    ).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails rather than returning an incomplete result at the page cap", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(success([], { nextCursor: "more" }));
    await expect(
      collectPages(createHttpClient(fetcher), "/api/v1/sets", z.array(schema), 1),
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });
  it("encodes IDs as one segment", () => {
    expect(apiId("a/b?c#d")).toBe("a%2Fb%3Fc%23d");
  });
  it.each(["", ".", ".."])("rejects ID %j", (id) => {
    expect(() => apiId(id)).toThrow("VALIDATION");
  });
});

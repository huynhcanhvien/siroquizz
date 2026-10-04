import { afterEach, describe, expect, it, vi } from "vitest";
import { authRequest, createHttpAuthRepository } from "./http-repository";
import { createHttpClient } from "@/lib/http-client";
const rawUser = {
  id: "user",
  email: "test@example.com",
  name: "Tester",
  createdAt: "2026-10-04T00:00:00Z",
};
const user = {
  id: rawUser.id,
  email: rawUser.email,
  displayName: rawUser.name,
  createdAt: rawUser.createdAt,
  avatarColor: "indigo",
  uiLocale: "vi",
};
afterEach(() => vi.unstubAllGlobals());
function fixture(data: unknown, status = 200) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(data, { status }));
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, repository: createHttpAuthRepository(createHttpClient(fetcher)) };
}
describe("HTTP auth boundary", () => {
  it("reads the sanitized domain profile", async () => {
    const { repository } = fixture({ success: true, data: user });
    expect(await repository.getSession()).toEqual(user);
  });
  it("treats 401 as signed out but preserves other failures", async () => {
    expect(
      await fixture(
        { success: false, error: { code: "UNAUTHENTICATED" } },
        401,
      ).repository.getSession(),
    ).toBeNull();
    await expect(
      fixture({ success: false, error: { code: "INTERNAL" } }, 500).repository.getSession(),
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });
  it("registers with locale, consent and a verification callback", async () => {
    const { repository, fetcher } = fixture({ user: rawUser });
    await expect(
      repository.register(
        {
          displayName: "Tester",
          email: rawUser.email,
          password: "strong1234",
          confirmPassword: "strong1234",
          acceptTerms: true,
        },
        "zh",
      ),
    ).resolves.toEqual(user);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      name: "Tester",
      uiLocale: "zh",
      acceptTerms: true,
      callbackURL: "/verify-email",
    });
  });
  it("maps remember-me and safely logs out", async () => {
    const { repository, fetcher } = fixture({
      user: { ...rawUser, avatarColor: "rose", uiLocale: "en" },
    });
    expect(
      await repository.login({ email: rawUser.email, password: "strong1234", remember: false }),
    ).toMatchObject({ avatarColor: "rose", uiLocale: "en" });
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      rememberMe: false,
    });
    await repository.logout();
    expect(fetcher.mock.calls[1][0]).toBe("/api/auth/sign-out");
  });
  it("requests reset without exposing whether the account exists", async () => {
    const { repository, fetcher } = fixture({ status: true });
    await repository.requestPasswordReset(rawUser.email);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      email: rawUser.email,
      redirectTo: "/reset-password",
    });
  });
  it("updates the sanitized profile through the domain API", async () => {
    const { repository } = fixture({ success: true, data: user });
    expect(await repository.updateProfile({ displayName: "Changed" })).toEqual(user);
  });
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "INVALID_CREDENTIALS"],
    ["EMAIL_NOT_VERIFIED", "EMAIL_NOT_VERIFIED"],
    ["PASSWORD_TOO_SHORT", "VALIDATION"],
    ["PASSWORD_TOO_LONG", "VALIDATION"],
    ["VALIDATION_ERROR", "VALIDATION"],
    ["constructor", "UNKNOWN"],
  ])("maps %s without exposing messages", async (code, expected) => {
    fixture({ code, message: "private server detail" }, 400);
    await expect(authRequest("sign-in/email", {})).rejects.toMatchObject({
      code: expected,
      message: expected,
    });
  });
  it("handles GET and rate-limited/non-JSON/network responses", async () => {
    const { fetcher } = fixture({});
    await authRequest("get-session");
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    fixture({}, 429);
    await expect(authRequest("sign-in/email", {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    fetcher.mockImplementation(async () => new Response("not JSON", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(authRequest("sign-in/email", {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    fetcher.mockImplementation(async () => new Response("not JSON", { status: 500 }));
    await expect(authRequest("get-session")).rejects.toMatchObject({ code: "UNKNOWN" });
    fetcher.mockRejectedValue(new Error("private network detail"));
    await expect(authRequest("get-session")).rejects.toMatchObject({ code: "NETWORK" });
  });
  it("rejects malformed auth users", async () => {
    const { repository } = fixture({ user: {} });
    await expect(
      repository.login({ email: rawUser.email, password: "strong1234", remember: true }),
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});

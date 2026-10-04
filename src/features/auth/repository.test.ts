import { beforeEach, describe, expect, it } from "vitest";
import { createStorage } from "@/lib/storage";
import { createLocalAuthRepository, type AuthRepository } from "./repository";

const registration = {
  displayName: "Minh",
  email: "minh@example.com",
  password: "matkhau123",
  confirmPassword: "matkhau123",
  acceptTerms: true,
};

describe("local AuthRepository", () => {
  let repo: AuthRepository;

  beforeEach(() => {
    window.sessionStorage.clear();
    repo = createLocalAuthRepository({
      storage: createStorage(window.localStorage),
      sessionStorage: createStorage(window.sessionStorage),
    });
  });

  it("has no session initially", async () => {
    await expect(repo.getSession()).resolves.toBeNull();
  });

  it("registers a user, signs them in and never exposes the password hash", async () => {
    const user = await repo.register(registration, "vi");
    expect(user).toMatchObject({ email: "minh@example.com", displayName: "Minh", uiLocale: "vi" });
    expect(user).not.toHaveProperty("passwordHash");
    await expect(repo.getSession()).resolves.toEqual(user);
  });

  it("rejects a duplicate email", async () => {
    await repo.register(registration, "vi");
    await expect(repo.register(registration, "vi")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("logs in with the right password and rejects a wrong one", async () => {
    await repo.register(registration, "vi");
    await repo.logout();
    await expect(
      repo.login({ email: "minh@example.com", password: "sai-mat-khau1", remember: true }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const user = await repo.login({
      email: "minh@example.com",
      password: "matkhau123",
      remember: true,
    });
    expect(user.email).toBe("minh@example.com");
  });

  it("rejects an unknown email with the same error as a wrong password", async () => {
    await expect(
      repo.login({ email: "ghost@example.com", password: "x1234567", remember: false }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("keeps a non-remembered session in session storage only", async () => {
    await repo.register(registration, "vi");
    await repo.logout();
    await repo.login({ email: "minh@example.com", password: "matkhau123", remember: false });
    expect(window.localStorage.getItem("siroquizz:v1:session")).toBeNull();
    expect(window.sessionStorage.getItem("siroquizz:v1:session")).not.toBeNull();
  });

  it("logs out", async () => {
    await repo.register(registration, "vi");
    await repo.logout();
    await expect(repo.getSession()).resolves.toBeNull();
  });

  it("updates the profile of the signed-in user", async () => {
    await repo.register(registration, "vi");
    const updated = await repo.updateProfile({
      displayName: "Minh Anh",
      avatarColor: "rose",
      uiLocale: "zh",
    });
    expect(updated).toMatchObject({ displayName: "Minh Anh", avatarColor: "rose", uiLocale: "zh" });
    await expect(repo.getSession()).resolves.toMatchObject({ displayName: "Minh Anh" });
  });

  it("validates profile updates", async () => {
    await repo.register(registration, "vi");
    await expect(repo.updateProfile({ displayName: "A" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    // Untyped input, as it would arrive from an API request body.
    const untrusted = (value: object) => value as Parameters<AuthRepository["updateProfile"]>[0];
    await expect(repo.updateProfile(untrusted({ avatarColor: "neon" }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(repo.updateProfile(untrusted({ uiLocale: "xx" }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("requires a session to update the profile", async () => {
    await expect(repo.updateProfile({ displayName: "X y" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("validates input at the repository boundary", async () => {
    await expect(
      repo.register({ ...registration, email: "not-an-email" }, "vi"),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("accepts password reset requests without revealing whether the email exists", async () => {
    await expect(repo.requestPasswordReset("ghost@example.com")).resolves.toBeUndefined();
  });

  it("returns null when the session points to a deleted account", async () => {
    await repo.register(registration, "vi");
    window.localStorage.removeItem("siroquizz:v1:accounts");
    await expect(repo.getSession()).resolves.toBeNull();
  });
});

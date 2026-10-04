import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, loginSchema, profileSchema, registerSchema } from "./schemas";

const validRegistration = {
  displayName: "Lan Anh",
  email: "  Lan@Example.com ",
  password: "hocchamchi1",
  confirmPassword: "hocchamchi1",
  acceptTerms: true,
};

function messagesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("registerSchema", () => {
  it("accepts a valid registration and normalizes the email", () => {
    const result = registerSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("lan@example.com");
  });

  it("requires letters and digits in the password", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(messagesFor(result).password).toBe("passwordWeak");
  });

  it("rejects short passwords", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "a1",
      confirmPassword: "a1",
    });
    expect(messagesFor(result).password).toBe("passwordMin");
  });

  it("reports mismatched confirmation on the confirm field", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: "different1",
    });
    expect(messagesFor(result).confirmPassword).toBe("passwordMismatch");
  });

  it("requires accepting the terms", () => {
    const result = registerSchema.safeParse({ ...validRegistration, acceptTerms: false });
    expect(messagesFor(result).acceptTerms).toBe("termsRequired");
  });

  it("validates display name length", () => {
    const result = registerSchema.safeParse({ ...validRegistration, displayName: "A" });
    expect(messagesFor(result).displayName).toBe("nameLength");
  });
});

describe("loginSchema", () => {
  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "abc", password: "x", remember: false });
    expect(messagesFor(result).email).toBe("emailInvalid");
  });

  it("requires a password", () => {
    const result = loginSchema.safeParse({ email: "a@b.co", password: "", remember: true });
    expect(messagesFor(result).password).toBe("required");
  });
});

describe("forgotPasswordSchema", () => {
  it("requires an email", () => {
    expect(messagesFor(forgotPasswordSchema.safeParse({ email: " " })).email).toBe("required");
  });
});

describe("profileSchema", () => {
  it("only accepts known avatar colors", () => {
    expect(profileSchema.safeParse({ displayName: "Minh", avatarColor: "neon" }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ displayName: "Minh", avatarColor: "amber" }).success).toBe(
      true,
    );
  });
});

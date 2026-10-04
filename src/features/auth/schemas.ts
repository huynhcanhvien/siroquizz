import { z } from "zod";
import { LOCALES } from "@/i18n/config";

/** Error messages are i18n keys under the `validation` namespace. */
export const PASSWORD_MIN_LENGTH = 8;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

export const AVATAR_COLORS = ["indigo", "amber", "emerald", "rose", "sky", "violet"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "emailInvalid" })
  .pipe(z.email({ error: "emailInvalid" }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: "passwordMin" })
  .max(128, { error: "passwordMax" })
  .regex(/\p{L}/u, { error: "passwordWeak" })
  .regex(/\d/, { error: "passwordWeak" });

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN, { error: "nameLength" })
  .max(DISPLAY_NAME_MAX, { error: "nameLength" });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }),
  remember: z.boolean(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, { error: "required" }),
    acceptTerms: z.boolean().refine((value) => value, { error: "termsRequired" }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    error: "passwordMismatch",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const profileSchema = z.object({
  displayName: displayNameSchema,
  avatarColor: z.enum(AVATAR_COLORS),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  avatarColor: z.enum(AVATAR_COLORS).optional(),
  uiLocale: z.enum(LOCALES).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  displayName: z.string(),
  avatarColor: z.string(),
  uiLocale: z.string(),
  createdAt: z.string(),
});

export const storedAccountSchema = userSchema.extend({ passwordHash: z.string().min(1) });
export type StoredAccount = z.infer<typeof storedAccountSchema>;

export const sessionSchema = z.object({
  userId: z.string().min(1),
  createdAt: z.string(),
  remember: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

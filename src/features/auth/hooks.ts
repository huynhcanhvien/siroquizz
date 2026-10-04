"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { buildSampleSets } from "@/features/sets/seed";
import { useRepositories } from "@/lib/data-provider";
import type { User } from "@/lib/types";
import type { ProfileUpdate } from "./repository";
import { sessionKey } from "./query-keys";
import type { LoginInput, RegisterInput } from "./schemas";
import { authRequest } from "./http-repository";
import { createHttpClient } from "@/lib/http-client";
import { z } from "zod";

export function useAuthProviders() {
  return useQuery({
    queryKey: ["authProviders"],
    enabled: process.env.NEXT_PUBLIC_DATA_SOURCE === "http",
    queryFn: async () =>
      (await createHttpClient().request("/api/v1/config", z.object({ google: z.boolean() }))).data,
  });
}
export function useGoogleLogin() {
  return useMutation({
    mutationFn: async () => {
      const response = z
        .object({ url: z.url() })
        .parse(await authRequest("sign-in/social", { provider: "google", callbackURL: "/home" }));
      const target = new URL(response.url);
      if (target.protocol !== "https:" || target.hostname !== "accounts.google.com")
        throw new Error("Invalid OAuth URL");
      window.location.assign(response.url);
    },
  });
}

export { sessionKey };

export function useSession() {
  const { auth } = useRepositories();
  return useQuery({ queryKey: sessionKey, queryFn: () => auth.getSession() });
}

export function useLogin() {
  const { auth } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    // Drop the mutation (and the plaintext password in its variables) as soon as it settles.
    gcTime: 0,
    mutationFn: (input: LoginInput) => auth.login(input),
    onSuccess: (user) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
      queryClient.setQueryData<User | null>(sessionKey, user);
    },
  });
}

export function useRegister() {
  const { auth, sets } = useRepositories();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const t = useTranslations("seed");

  return useMutation({
    gcTime: 0,
    mutationFn: async (input: RegisterInput) => {
      const user = await auth.register(input, locale);
      if (process.env.NEXT_PUBLIC_DATA_SOURCE === "http") return user;
      const samples = buildSampleSets({
        ielts: { title: t("ielts.title"), description: t("ielts.description") },
        hsk: { title: t("hsk.title"), description: t("hsk.description") },
        travel: { title: t("travel.title"), description: t("travel.description") },
      });
      // Sample sets are a bonus: the account already exists, so a seeding failure must not fail sign-up.
      try {
        for (const sample of samples) await sets.create(sample);
      } catch (error) {
        console.error("Failed to seed sample sets", error);
      }
      return user;
    },
    onSuccess: (user) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
      queryClient.setQueryData<User | null>(
        sessionKey,
        process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? null : user,
      );
    },
  });
}

export function useRequestPasswordReset() {
  const { auth } = useRepositories();
  return useMutation({ mutationFn: (email: string) => auth.requestPasswordReset(email) });
}

export function useLogout() {
  const { auth } = useRepositories();
  return useMutation({
    mutationFn: () => auth.logout(),
    // A full navigation drops every in-memory cache, and leaving the session query untouched
    // keeps the auth guard from racing this navigation with its own /login?next=… redirect.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is the point here
    onSuccess: () => window.location.assign("/login"),
  });
}

export function useUpdateProfile() {
  const { auth } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: ProfileUpdate) => auth.updateProfile(update),
    onSuccess: (user) => queryClient.setQueryData<User | null>(sessionKey, user),
  });
}

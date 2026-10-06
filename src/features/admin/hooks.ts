"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useToast } from "@/components/ui/Toast";
import { createHttpClient } from "@/lib/http-client";
import { useErrorMessage } from "@/lib/use-messages";
export const adminClient = createHttpClient();
export function useAdminQuery<T>(path: string, schema: z.ZodType<T>, refresh = false) {
  return useQuery({
    queryKey: ["admin", path],
    queryFn: async () => (await adminClient.request(`/api/v1/admin/${path}`, schema)).data,
    refetchInterval: refresh ? 15000 : false,
  });
}
export function useAdminMutation() {
  const cache = useQueryClient();
  const { toast } = useToast();
  const t = useTranslations("admin");
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: async ({
      path,
      body = {},
      method = "POST",
    }: {
      path: string;
      body?: object;
      method?: "POST" | "PATCH";
    }) => {
      await adminClient.request(`/api/v1/admin/${path}`, z.unknown(), {
        method,
        body,
      });
    },
    onSuccess: () => {
      toast(t("done"));
      void cache.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
}

import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getSessionContext } from "./api";

/** The signed-in person viewing a public page, or null for a guest. Never redirects. */
export const currentViewerId = cache(async (): Promise<string | null> =>
  getSessionContext(await headers()).then(
    (session) => session.user.id,
    () => null,
  ),
);

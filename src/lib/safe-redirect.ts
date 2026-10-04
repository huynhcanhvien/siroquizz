export const DEFAULT_AFTER_LOGIN = "/home";

// Control characters (tab, newline, NUL…) are silently stripped by the URL parser,
// so "/\t/evil.com" would otherwise become the protocol-relative "//evil.com".
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\\]/;
const PROBE_ORIGIN = "http://siroquizz.invalid";

/** Only allows same-origin relative paths to prevent open redirects via `?next=`. */
export function safeNextPath(value: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARACTERS.test(value)) return fallback;
  try {
    const url = new URL(value, PROBE_ORIGIN);
    return url.origin === PROBE_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

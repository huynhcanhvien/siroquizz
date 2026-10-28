/** Standard (padded) base64, as produced by toBase64. */
export const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const CHUNK = 0x8000;

/** Encodes bytes as base64 in the browser and on the server (no Buffer needed). */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** Decodes base64 produced by toBase64; throws on malformed input. */
export function fromBase64(value: string): Uint8Array {
  if (!BASE64_PATTERN.test(value)) throw new Error("Invalid base64");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decoded size of a base64 string, without decoding it. */
export const base64Bytes = (value: string): number =>
  Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);

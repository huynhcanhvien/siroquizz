export function filterParams(params: URLSearchParams, keys: readonly string[]) {
  const result = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) result.set(key, value);
  }
  const cursor = params.get("cursor");
  if (cursor) result.set("cursor", cursor);
  return result;
}
export function updateFilters(params: URLSearchParams, values: Record<string, string>) {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  for (const [key, value] of Object.entries(values)) {
    if (value.trim()) next.set(key, value.trim());
    else next.delete(key);
  }
  return next;
}

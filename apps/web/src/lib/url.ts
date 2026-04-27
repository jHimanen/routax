/**
 * Canonical app origin for shareable links (task 01: NEXT_PUBLIC_BASE_URL e.g. https://routax.cc).
 * Falls back to the browser origin in the client.
 */
export function getCanonicalAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function buildRouteUrl(routeId: string): string {
  return `${getCanonicalAppOrigin()}/?route=${encodeURIComponent(routeId)}`;
}

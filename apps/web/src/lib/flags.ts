import { getApiBaseUrl } from "./api";

let flagsRequest: Promise<Record<string, boolean>> | null = null;

function parseFlagsJson(json: unknown): Record<string, boolean> {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Fetches flag booleans for the current session, cached in-process so
 * every consumer shares one HTTP round-trip.
 *
 * The cache is cleared on rejection so React Strict Mode's double-mount
 * (which aborts the first fetch) doesn't permanently poison the cache.
 */
export function fetchFlags(signal?: AbortSignal): Promise<Record<string, boolean>> {
  if (!flagsRequest) {
    flagsRequest = (async () => {
      const response = await fetch(`${getApiBaseUrl()}/flags`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
      });
      if (!response.ok) {
        throw new Error(`Flags request failed with status ${response.status}`);
      }
      const json: unknown = await response.json();
      return parseFlagsJson(json);
    })();
    flagsRequest.catch(() => {
      flagsRequest = null;
    });
  }
  return flagsRequest;
}

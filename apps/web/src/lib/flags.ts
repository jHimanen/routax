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
  }
  return flagsRequest;
}

import {
  type CreateRouteRequest,
  CreateRouteRequestSchema,
  type ListRoutesResponse,
  ListRoutesResponseSchema,
  type RouteRequest,
  type RouteResult,
  RouteResultSchema,
  type SavedRoute,
  SavedRouteSchema,
} from "@routax/shared";

const DEFAULT_API_BASE_URL = "/api";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export { getApiBaseUrl };

export async function postRoute(request: RouteRequest, signal?: AbortSignal): Promise<RouteResult> {
  const response = await fetch(`${getApiBaseUrl()}/route`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Route request failed with status ${response.status}`);
  }

  const json = await response.json();
  return RouteResultSchema.parse(json);
}

export async function createRoute(
  request: CreateRouteRequest,
  signal?: AbortSignal,
): Promise<SavedRoute> {
  const parsed = CreateRouteRequestSchema.parse(request);
  const response = await fetch(`${getApiBaseUrl()}/routes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(parsed),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Save route failed with status ${response.status}`);
  }

  const json = await response.json();
  return SavedRouteSchema.parse(json);
}

export async function listRoutes(limit: number, signal?: AbortSignal): Promise<ListRoutesResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`${getApiBaseUrl()}/routes?${params}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`List routes failed with status ${response.status}`);
  }

  const json = await response.json();
  return ListRoutesResponseSchema.parse(json);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getRoute(id: string, signal?: AbortSignal): Promise<SavedRoute | null> {
  if (!UUID_RE.test(id)) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/routes/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Get route failed with status ${response.status}`);
  }

  const json = await response.json();
  return SavedRouteSchema.parse(json);
}

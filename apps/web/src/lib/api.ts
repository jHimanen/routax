import { type RouteRequest, type RouteResult, RouteResultSchema } from "@via/shared";

const DEFAULT_API_BASE_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export async function postRoute(request: RouteRequest): Promise<RouteResult> {
  const response = await fetch(`${getApiBaseUrl()}/route`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Route request failed with status ${response.status}`);
  }

  const json = await response.json();
  return RouteResultSchema.parse(json);
}

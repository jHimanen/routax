import type { RouteRequest, RouteResult } from "../types/route";

export interface RoutingProvider {
  planRoute(request: RouteRequest): Promise<RouteResult>;
}

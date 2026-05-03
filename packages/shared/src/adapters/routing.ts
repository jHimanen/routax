import type { PointToPointRequest, RoundTripRequest, RouteResult } from "../types/route";

export interface RoutingProvider {
  planRoute(request: PointToPointRequest): Promise<RouteResult>;
  planRoundTrip?(request: RoundTripRequest): Promise<RouteResult>;
}

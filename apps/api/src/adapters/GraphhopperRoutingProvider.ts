import type { RouteRequest, RouteResult, RoutingProvider } from "@routax/shared";

interface GhResponse {
  paths: Array<{
    distance: number;
    time: number;
    ascent?: number;
    descent?: number;
    points: {
      type: "LineString";
      coordinates: Array<[number, number]>;
    };
  }>;
}

function buildCustomModel(profile: RouteRequest["profile"]): unknown {
  const t = profile.avoidTraffic;
  const q = profile.preferQuietSurfaces;

  return {
    priority: [
      {
        if: "road_class == PRIMARY",
        multiply_by: (1 - t * 0.9).toFixed(2),
      },
      {
        else_if: "road_class == SECONDARY",
        multiply_by: (1 - t * 0.5).toFixed(2),
      },
      {
        if: "road_class == CYCLEWAY || road_class == TRACK || road_class == LIVING_STREET || road_class == PATH",
        multiply_by: (1 + q * 0.8).toFixed(2),
      },
    ],
    distance_influence: 70,
  };
}

export class GraphhopperRoutingProvider implements RoutingProvider {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.GRAPHHOPPER_URL ?? "http://localhost:8989";
  }

  async planRoute(request: RouteRequest): Promise<RouteResult> {
    const body = {
      points: [
        [request.start.lng, request.start.lat],
        [request.end.lng, request.end.lat],
      ],
      profile: "bike",
      points_encoded: false,
      "ch.disable": true,
      custom_model: buildCustomModel(request.profile),
    };

    const response = await fetch(`${this.baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphHopper returned ${response.status}: ${text}`);
    }

    const data = (await response.json()) as GhResponse;
    const path = data.paths[0];

    if (!path) {
      throw new Error("GraphHopper returned no paths");
    }

    return {
      distance: path.distance,
      duration: Math.round(path.time / 1000),
      geometry: path.points,
      ascent: path.ascent,
      descent: path.descent,
    };
  }
}

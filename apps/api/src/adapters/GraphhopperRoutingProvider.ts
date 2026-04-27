import type { RouteRequest, RouteResult, RoutingProvider } from "@routax/shared";

interface GhResponse {
  paths: Array<{
    distance: number;
    time: number;
    ascend: number;
    descend: number;
    points: {
      type: "LineString";
      coordinates: Array<[number, number, number]>;
    };
  }>;
}

function buildCustomModel(profile: RouteRequest["profile"]): unknown {
  const t = profile.avoidTraffic;
  const q = profile.preferQuietSurfaces;
  const g = profile.maxGradient;

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
      {
        if: `average_slope > ${g}`,
        multiply_by: "0.01",
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
      elevation: true,
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

    const coords3d = path.points.coordinates;
    const coordinates: [number, number][] = coords3d.map(([lng, lat]) => [lng, lat]);
    const elevationProfile: number[] = coords3d.map(([, , ele]) => ele);

    if (elevationProfile.length !== coordinates.length) {
      throw new Error(
        `GH elevation/coordinate length mismatch: ${elevationProfile.length} vs ${coordinates.length}`,
      );
    }

    return {
      distance: path.distance,
      duration: Math.round(path.time / 1000),
      geometry: { type: "LineString", coordinates },
      elevationProfile,
      ascent: path.ascend,
      descent: path.descend,
    };
  }
}

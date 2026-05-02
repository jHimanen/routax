import type { RouteRequest, RouteResult, RoutingProvider, SurfaceClass } from "@routax/shared";

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
    details?: {
      surface?: Array<[number, number, string]>;
    };
  }>;
}

export function normalizeSurface(raw: string): SurfaceClass {
  switch (raw) {
    case "asphalt":
    case "concrete":
    case "paving_stones":
      return "asphalt";
    case "sett":
    case "cobblestone":
    case "bricks":
    case "concrete:plates":
      return "paved_rough";
    case "compacted":
    case "fine_gravel":
    case "pebblestone":
      return "compacted";
    case "gravel":
    case "dirt":
    case "ground":
    case "earth":
      return "gravel";
    case "sand":
    case "mud":
      return "sand";
    case "wood":
    case "metal_grid":
      return "wood";
    case "unpaved":
      return "unpaved";
    default:
      return "unknown";
  }
}

export function parseSurfaceDetails(
  ranges: Array<[number, number, string]>,
  edgeCount: number,
): SurfaceClass[] {
  const surfaces: SurfaceClass[] = Array(edgeCount).fill("unknown" as SurfaceClass);
  for (const [from, to, raw] of ranges) {
    for (let i = from; i < to; i++) {
      surfaces[i] = normalizeSurface(raw);
    }
  }
  // Only validate coverage when GH actually returned ranges.
  // Empty ranges = all-untagged route, which is legitimate for remote forest tracks.
  if (ranges.length > 0) {
    const covered = ranges.reduce((acc, [from, to]) => acc + (to - from), 0);
    if (covered !== edgeCount) {
      throw new Error(`GH surface ranges cover ${covered} edges, expected ${edgeCount}`);
    }
  }
  return surfaces;
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
      details: ["surface"],
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

    const surfaceRanges = path.details?.surface ?? [];
    const surfaces = parseSurfaceDetails(surfaceRanges, coordinates.length - 1);

    return {
      distance: path.distance,
      duration: Math.round(path.time / 1000),
      geometry: { type: "LineString", coordinates },
      elevationProfile,
      ascent: path.ascend,
      descent: path.descend,
      surfaces,
    };
  }
}

import {
  type CueEntry,
  PRESET_DEFAULTS,
  type PointToPointRequest,
  type RoundTripRequest,
  type RouteProfilePreset,
  type RouteResult,
  type RoutingProfile,
  type RoutingProvider,
  type SurfaceClass,
  type Waypoint,
} from "@routax/shared";

interface GhInstruction {
  distance: number;
  sign: number;
  interval: [number, number];
  text: string;
  street_name?: string;
}

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
    instructions?: GhInstruction[];
  }>;
}

export function normalizeManeuver(sign: number): string {
  switch (sign) {
    case -3:
      return "sharp_left";
    case -2:
      return "turn_left";
    case -1:
      return "slight_left";
    case 0:
      return "continue";
    case 1:
      return "slight_right";
    case 2:
      return "turn_right";
    case 3:
      return "sharp_right";
    case 4:
      return "finish";
    case 5:
      return "via_point";
    case 6:
      return "roundabout_right";
    case -6:
      return "roundabout_left";
    case 7:
      return "keep_right";
    case -7:
      return "keep_left";
    default:
      return "continue";
  }
}

export function parseInstructions(
  instructions: GhInstruction[],
  coords: [number, number][],
  distanceOffset = 0,
  indexOffset = 0,
): CueEntry[] {
  if (instructions.length === 0) return [];
  let cumulative = distanceOffset;
  return instructions.map((instr, i) => {
    const fromPrev = i === 0 ? 0 : (instructions[i - 1]?.distance ?? 0);
    if (i > 0) cumulative += fromPrev;
    const coordIndex = instr.interval[0];
    const coord = coords[coordIndex] ?? coords[0] ?? [0, 0];
    const entry: CueEntry = {
      index: indexOffset + i,
      distanceFromStartMeters: cumulative,
      distanceFromPreviousMeters: i === 0 ? 0 : fromPrev,
      maneuver: normalizeManeuver(instr.sign),
      text: instr.text.trim(),
      coordinate: coord,
    };
    if (instr.street_name && instr.street_name.trim().length > 0) {
      entry.streetName = instr.street_name.trim();
    }
    return entry;
  });
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

const DISTANCE_INFLUENCE: Record<RouteProfilePreset, number> = {
  fastest_direct: 60,
  quiet_country_roads: 80,
  maximum_climbing: 75,
  avoid_gravel: 75,
};

export function buildCustomModel(profile: RoutingProfile, preset: RouteProfilePreset): unknown {
  const t = profile.avoidTraffic;
  const cw = profile.preferCycleways;
  const g = profile.maxGradient;
  const s = profile.preferSmoothSurfaces;

  // Zero baseline: only the gradient hard-cap fires at all-zero sliders.
  const priority: unknown[] = [
    {
      if: `average_slope > ${g}`,
      multiply_by: "0.01",
    },
  ];

  // Ferry and ford exclusions: conditional on user-facing toggles.
  // bike-base.json no longer carries the ferry rule; this per-request rule is the contract.
  if (!profile.allowFerries) {
    priority.push({ if: "road_environment == FERRY", multiply_by: "0" });
  }
  if (!profile.allowWaterCrossings) {
    priority.push({ if: "road_environment == FORD", multiply_by: "0" });
  }

  // Avoid traffic: penalise busy roads and reward quiet alternatives.
  // Both sub-blocks are guarded so nothing fires at t=0 (zero baseline).
  // The reward block is a fresh `if` (not else_if) so it fires independently
  // of the PRIMARY/SECONDARY chain.
  if (t > 0) {
    priority.push(
      { if: "road_class == PRIMARY", multiply_by: (1 - t * 0.9).toFixed(2) },
      { else_if: "road_class == SECONDARY", multiply_by: (1 - t * 0.5).toFixed(2) },
      {
        if: "road_class == CYCLEWAY || road_class == TRACK || road_class == LIVING_STREET || road_class == PATH",
        multiply_by: (1 + t * 0.6).toFixed(2),
      },
    );
  }

  // Prefer cycleways: `if`/`else_if` so a segment that is both road_class==CYCLEWAY
  // and bike_priority>=1.4 (a designated separate cycleway) gets only the stronger
  // CYCLEWAY factor — no double-stacking.
  //
  // bike_priority is a numeric EV (4-bit storage in GH 11.0; max 1.5).
  // SLIGHT_PREFER=1.2, PREFER=1.5. In Finnish OSM data only road_class==CYCLEWAY
  // segments reliably reach >=1.4; non-cycleway designated paths max at 1.2.
  if (cw > 0) {
    priority.push(
      { if: "road_class == CYCLEWAY", multiply_by: (1 + cw * 1.2).toFixed(2) },
      { else_if: "bike_priority >= 1.4", multiply_by: (1 + cw * 0.5).toFixed(2) },
    );
  }

  // Prefer smooth surfaces: reward paved segments. At s=0 nothing fires (zero baseline).
  // Replaces the old avoid_gravel preset hard penalties with a softer reward model.
  // Verify ASPHALT/CONCRETE/PAVED names against GET /info before merging.
  if (s > 0) {
    priority.push({
      if: "surface == ASPHALT || surface == CONCRETE || surface == PAVED",
      multiply_by: (1 + s * 0.8).toFixed(2),
    });
  }

  // MTB cap: hard exclusion. Default 6 means `mtb_rating > 6` never fires on real OSM data.
  if (profile.maxTrailDifficulty < 6) {
    priority.push({ if: `mtb_rating > ${profile.maxTrailDifficulty}`, multiply_by: "0" });
  }

  return {
    priority,
    distance_influence: DISTANCE_INFLUENCE[preset],
  };
}

function resolveProfile(request: {
  preset: RouteProfilePreset;
  advancedOverrides?: Partial<RoutingProfile>;
}): RoutingProfile {
  const defaults = PRESET_DEFAULTS[request.preset];
  const overrides = request.advancedOverrides ?? {};
  return {
    avoidTraffic: overrides.avoidTraffic ?? defaults.avoidTraffic,
    preferSmoothSurfaces: overrides.preferSmoothSurfaces ?? defaults.preferSmoothSurfaces,
    maxGradient: overrides.maxGradient ?? defaults.maxGradient,
    preferCycleways: overrides.preferCycleways ?? defaults.preferCycleways,
    minimiseClimbing: overrides.minimiseClimbing ?? defaults.minimiseClimbing,
    allowFerries: overrides.allowFerries ?? defaults.allowFerries,
    allowWaterCrossings: overrides.allowWaterCrossings ?? defaults.allowWaterCrossings,
    maxTrailDifficulty: overrides.maxTrailDifficulty ?? defaults.maxTrailDifficulty,
  };
}

const DIRECTION_HEADINGS: Record<string, number | undefined> = {
  any: undefined,
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

function sampleWaypointsFromGeometry(coords: [number, number][], viaCount: number): Waypoint[] {
  const origin = coords[0];
  if (!origin) throw new Error("Cannot sample waypoints from empty coordinate array");
  const startWp: Waypoint = {
    id: crypto.randomUUID(),
    position: { lng: origin[0], lat: origin[1] },
    role: "start",
  };
  const finishWp: Waypoint = {
    id: crypto.randomUUID(),
    position: { lng: origin[0], lat: origin[1] },
    role: "finish",
  };

  const viaWaypoints: Waypoint[] = [];
  for (let i = 1; i <= viaCount; i++) {
    const idx = Math.floor((coords.length * i) / (viaCount + 1));
    const coord = coords[idx];
    if (!coord) continue;
    viaWaypoints.push({
      id: crypto.randomUUID(),
      position: { lng: coord[0], lat: coord[1] },
      role: "via",
    });
  }

  return [startWp, ...viaWaypoints, finishWp];
}

export function stitchRouteLegs(legs: RouteResult[]): RouteResult {
  if (legs.length === 0) throw new Error("No legs to stitch");

  const first = legs[0];
  if (!first) throw new Error("No legs to stitch");
  if (legs.length === 1) return first;

  const coordinates: [number, number][] = [...first.geometry.coordinates];
  const elevationProfile: number[] = [...first.elevationProfile];
  const surfaces: SurfaceClass[] = [...first.surfaces];
  const cueSheet = [...first.cueSheet];
  let distance = first.distance;
  let duration = first.duration;
  let ascent = first.ascent;
  let descent = first.descent;

  for (const leg of legs.slice(1)) {
    const legCoords = leg.geometry.coordinates;
    const legElev = leg.elevationProfile;

    // Skip the first coord/elevation — it's the duplicate junction point shared with the previous leg.
    coordinates.push(...(legCoords.slice(1) as [number, number][]));
    elevationProfile.push(...legElev.slice(1));

    // Surfaces are per-edge (length = coords - 1); no deduplication needed.
    surfaces.push(...leg.surfaces);

    // Offset each cue's cumulative distance by the accumulated route distance so far.
    const distanceOffset = distance;
    const indexOffset = cueSheet.length;
    for (const cue of leg.cueSheet) {
      cueSheet.push({
        ...cue,
        index: indexOffset + cue.index,
        distanceFromStartMeters: distanceOffset + cue.distanceFromStartMeters,
      });
    }

    distance += leg.distance;
    duration += leg.duration;
    ascent += leg.ascent;
    descent += leg.descent;
  }

  return {
    distance,
    duration,
    geometry: { type: "LineString", coordinates },
    elevationProfile,
    ascent,
    descent,
    surfaces,
    cueSheet,
  };
}

export class GraphhopperRoutingProvider implements RoutingProvider {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.GRAPHHOPPER_URL ?? "http://localhost:8989";
  }

  private async planLeg(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    profile: RoutingProfile,
    preset: RouteProfilePreset,
  ): Promise<RouteResult> {
    const body = {
      points: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
      profile: "bike",
      elevation: true,
      points_encoded: false,
      "ch.disable": true,
      instructions: true,
      custom_model: buildCustomModel(profile, preset),
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
    const cueSheet = parseInstructions(path.instructions ?? [], coordinates);

    return {
      distance: path.distance,
      duration: Math.round(path.time / 1000),
      geometry: { type: "LineString", coordinates },
      elevationProfile,
      ascent: path.ascend,
      descent: path.descend,
      surfaces,
      cueSheet,
    };
  }

  async planRoute(request: PointToPointRequest): Promise<RouteResult> {
    const profile = resolveProfile(request);
    const pts = request.waypoints;

    const legResults = await Promise.all(
      pts.slice(0, -1).map((from, i) => {
        const to = pts[i + 1];
        if (!to) throw new Error(`Missing waypoint at index ${i + 1}`);
        return this.planLeg(from, to, profile, request.preset).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Leg ${i + 1}→${i + 2} is unroutable: ${msg}`);
        });
      }),
    );

    return stitchRouteLegs(legResults);
  }

  async planRoundTrip(request: RoundTripRequest): Promise<RouteResult> {
    const profile = resolveProfile(request);
    const heading = DIRECTION_HEADINGS[request.directionBias ?? "any"];

    const body: Record<string, unknown> = {
      points: [[request.start.lng, request.start.lat]],
      profile: "bike",
      elevation: true,
      points_encoded: false,
      "ch.disable": true,
      instructions: true,
      algorithm: "round_trip",
      "round_trip.distance": request.targetDistanceKm * 1000,
      "round_trip.seed": request.seed ?? 0,
      custom_model: buildCustomModel(profile, request.preset),
      details: ["surface"],
    };

    if (heading !== undefined) {
      body.heading = [heading];
      body.heading_penalty = 100;
    }

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
    const cueSheet = parseInstructions(path.instructions ?? [], coordinates);

    const generatedWaypoints = sampleWaypointsFromGeometry(coordinates, 4);

    return {
      distance: path.distance,
      duration: Math.round(path.time / 1000),
      geometry: { type: "LineString", coordinates },
      elevationProfile,
      ascent: path.ascend,
      descent: path.descend,
      surfaces,
      cueSheet,
      generatedWaypoints,
    };
  }
}

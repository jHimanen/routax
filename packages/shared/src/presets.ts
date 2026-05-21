import type { RouteProfilePreset, RoutingProfile } from "./types/route";

export const PRESET_DEFAULTS: Record<RouteProfilePreset, RoutingProfile> = {
  fastest_direct: {
    avoidTraffic: 0.0,
    preferQuietSurfaces: 0.0,
    maxGradient: 20,
    preferCycleways: 0.0,
    preferLargerRoads: 0.7,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 6,
  },
  quiet_country_roads: {
    avoidTraffic: 0.8,
    preferQuietSurfaces: 0.9,
    maxGradient: 8,
    preferCycleways: 0.6,
    preferLargerRoads: 0.2,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 4,
  },
  maximum_climbing: {
    avoidTraffic: 0.4,
    preferQuietSurfaces: 0.7,
    maxGradient: 20,
    preferCycleways: 0.2,
    preferLargerRoads: 0.0,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 6,
  },
  avoid_gravel: {
    avoidTraffic: 0.2,
    preferQuietSurfaces: 0.0,
    maxGradient: 12,
    preferCycleways: 0.5,
    preferLargerRoads: 0.6,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 2,
  },
};

export const PRESET_METADATA: Record<RouteProfilePreset, { label: string; description: string }> = {
  fastest_direct: {
    label: "Fastest direct",
    description: "Most direct route on main roads",
  },
  quiet_country_roads: {
    label: "Quiet country roads",
    description: "Avoids traffic, prefers cycling paths and small lanes",
  },
  maximum_climbing: {
    label: "Maximum climbing",
    description: "Seeks hilly terrain and off-road tracks",
  },
  avoid_gravel: {
    label: "Avoid gravel",
    description: "Stays on paved surfaces where possible",
  },
};

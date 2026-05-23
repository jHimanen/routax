import type { RouteProfilePreset, RoutingProfile } from "./types/route";

export const PRESET_DEFAULTS: Record<RouteProfilePreset, RoutingProfile> = {
  fastest_direct: {
    avoidTraffic: 0.1,
    preferSmoothSurfaces: 0.2,
    maxGradient: 15,
    preferCycleways: 0.0,
    minimiseClimbing: 0.0,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 6,
  },
  quiet_country_roads: {
    avoidTraffic: 0.7,
    preferSmoothSurfaces: 0.2,
    maxGradient: 10,
    preferCycleways: 0.5,
    minimiseClimbing: 0.0,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 4,
  },
  maximum_climbing: {
    avoidTraffic: 0.4,
    preferSmoothSurfaces: 0.0,
    maxGradient: 15,
    preferCycleways: 0.2,
    minimiseClimbing: 0.0,
    allowFerries: false,
    allowWaterCrossings: false,
    maxTrailDifficulty: 6,
  },
  avoid_gravel: {
    avoidTraffic: 0.5,
    preferSmoothSurfaces: 0.9,
    maxGradient: 10,
    preferCycleways: 0.5,
    minimiseClimbing: 0.0,
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

/** Single default profile tuned for the first customer segment: long-distance road cyclists. */
export const DEFAULT_PROFILE: RoutingProfile = {
  avoidTraffic: 0.5,
  preferCycleways: 0.6,
  preferSmoothSurfaces: 0.8,
  minimiseClimbing: 0.0,
  maxGradient: 15,
  allowFerries: false,
  allowWaterCrossings: false,
  maxTrailDifficulty: 6,
};

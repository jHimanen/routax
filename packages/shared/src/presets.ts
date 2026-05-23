import type { RoutingProfile } from "./types/route";

/** Single default profile tuned for the first customer segment: long-distance road cyclists. */
export const DEFAULT_PROFILE: RoutingProfile = {
  avoidTraffic: 0.5,
  preferCycleways: 0.6,
  preferSmoothSurfaces: 0.8,
  minimiseClimbing: 0.0,
  maxGradient: 15,
  allowFerries: false,
  allowWaterCrossings: false,
};

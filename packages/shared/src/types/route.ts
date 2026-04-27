import { z } from "zod";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Waypoint {
  id: string;
  position: LatLng;
  label?: string;
}

export interface RoutingProfile {
  /** 0 = ignore, 1 = strongly avoid high-traffic roads. */
  avoidTraffic: number;
  /** 0 = ignore, 1 = strongly prefer quiet/unpaved surfaces. */
  preferQuietSurfaces: number;
  /** Maximum acceptable gradient in percent (0–20). */
  maxGradient: number;
}

export const RouteRequestSchema = z.object({
  start: z.object({ lat: z.number(), lng: z.number() }),
  end: z.object({ lat: z.number(), lng: z.number() }),
  profile: z.object({
    avoidTraffic: z.number().min(0).max(1),
    preferQuietSurfaces: z.number().min(0).max(1),
    maxGradient: z.number().min(0).max(20),
  }),
});

export type RouteRequest = z.infer<typeof RouteRequestSchema>;

export const RouteResultSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  elevationProfile: z.array(z.number()),
  ascent: z.number(),
  descent: z.number(),
});

export type RouteResult = z.infer<typeof RouteResultSchema>;

import { z } from "zod";

export interface LatLng {
  lat: number;
  lng: number;
}

export const WaypointRoleSchema = z.enum(["start", "via", "finish"]);
export type WaypointRole = z.infer<typeof WaypointRoleSchema>;

export const WaypointSchema = z.object({
  id: z.string(),
  position: z.object({ lat: z.number(), lng: z.number() }),
  role: WaypointRoleSchema,
  label: z.string().optional(),
});

export type Waypoint = z.infer<typeof WaypointSchema>;

export const RouteProfilePresetSchema = z.enum([
  "quiet_country_roads",
  "fastest_direct",
  "maximum_climbing",
  "avoid_gravel",
]);
export type RouteProfilePreset = z.infer<typeof RouteProfilePresetSchema>;

export const RoutingProfileSchema = z.object({
  avoidTraffic: z.number().min(0).max(1),
  preferQuietSurfaces: z.number().min(0).max(1),
  maxGradient: z.number().min(0).max(20),
});

export interface RoutingProfile {
  /** 0 = ignore, 1 = strongly avoid high-traffic roads. */
  avoidTraffic: number;
  /** 0 = ignore, 1 = strongly prefer quiet/unpaved surfaces. */
  preferQuietSurfaces: number;
  /** Maximum acceptable gradient in percent (0–20). */
  maxGradient: number;
}

export const SurfaceClassSchema = z.enum([
  "asphalt",
  "paved_rough",
  "compacted",
  "gravel",
  "sand",
  "unpaved",
  "wood",
  "unknown",
]);
export type SurfaceClass = z.infer<typeof SurfaceClassSchema>;

export const RouteWaypointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const RouteRequestSchema = z.object({
  waypoints: z.array(RouteWaypointSchema).min(2),
  preset: RouteProfilePresetSchema,
  advancedOverrides: RoutingProfileSchema.partial().optional(),
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
  surfaces: z.array(SurfaceClassSchema).default([]),
});

export type RouteResult = z.infer<typeof RouteResultSchema>;

export const RouteGeometrySchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  })
  .superRefine((value, ctx) => {
    if (value.coordinates.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LineString must contain at least 2 points",
        path: ["coordinates"],
      });
    }
  });

export const SavedRouteSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string().min(1),
  preset: RouteProfilePresetSchema,
  geometry: RouteGeometrySchema,
  profile: RoutingProfileSchema,
  distance: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  ascent: z.number().int(),
  descent: z.number().int(),
  elevationProfile: z.array(z.number()),
  surfaceProfile: z.array(SurfaceClassSchema).default([]),
  waypoints: z.array(WaypointSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateRouteRequestSchema = z.object({
  name: z.string().min(1),
  preset: RouteProfilePresetSchema,
  profile: RoutingProfileSchema,
  geometry: RouteGeometrySchema,
  distance: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  ascent: z.number().int(),
  descent: z.number().int(),
  elevationProfile: z.array(z.number()),
  surfaceProfile: z.array(SurfaceClassSchema).default([]),
  waypoints: z.array(WaypointSchema).default([]),
});

export const UpdateRouteRequestSchema = z.object({
  name: z.string().min(1),
});

export const ListRoutesResponseSchema = z.object({
  items: z.array(SavedRouteSchema),
  nextCursor: z.string().optional(),
});

export const GpxPreviewRequestSchema = z.object({
  geometry: RouteGeometrySchema,
  elevationProfile: z.array(z.number()),
  distance: z.number(),
  name: z.string().max(80).optional(),
});

export type SavedRoute = z.infer<typeof SavedRouteSchema>;
export type CreateRouteRequest = z.infer<typeof CreateRouteRequestSchema>;
export type UpdateRouteRequest = z.infer<typeof UpdateRouteRequestSchema>;
export type ListRoutesResponse = z.infer<typeof ListRoutesResponseSchema>;
export type GpxPreviewRequest = z.infer<typeof GpxPreviewRequestSchema>;

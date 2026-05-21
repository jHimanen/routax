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
  preferCycleways: z.number().min(0).max(1).default(0),
  preferLargerRoads: z.number().min(0).max(1).default(0),
  allowFerries: z.boolean().default(false),
  allowWaterCrossings: z.boolean().default(false),
  // 0–6 mirrors OSM mtb:scale; 6 = no cap (rule `mtb_rating > 6` never fires on real data)
  maxTrailDifficulty: z.number().min(0).max(6).default(6),
});

export interface RoutingProfile {
  /** 0 = ignore, 1 = strongly avoid high-traffic roads. */
  avoidTraffic: number;
  /** 0 = ignore, 1 = strongly prefer quiet/unpaved surfaces. */
  preferQuietSurfaces: number;
  /** Maximum acceptable gradient in percent (0–20). */
  maxGradient: number;
  /** 0 = ignore; 1 = strongly prefer dedicated cycleways (`highway=cycleway`; in Part B also `bicycle=designated`). */
  preferCycleways: number;
  /** 0 = ignore, 1 = strongly prefer SECONDARY/TERTIARY roads over tracks/paths. */
  preferLargerRoads: number;
  /** When true, ferry edges are routable. Default false. */
  allowFerries: boolean;
  /** When true, ford crossings are routable. Default false. */
  allowWaterCrossings: boolean;
  /** Cap on mtb_rating (0–6). Default 6 = no cap. */
  maxTrailDifficulty: number;
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

export const PointToPointRequestSchema = z.object({
  mode: z.literal("point_to_point").optional().default("point_to_point"),
  waypoints: z.array(RouteWaypointSchema).min(2),
  preset: RouteProfilePresetSchema,
  advancedOverrides: RoutingProfileSchema.partial().optional(),
});

export type PointToPointRequest = z.infer<typeof PointToPointRequestSchema>;

export const RoundTripRequestSchema = z.object({
  mode: z.literal("round_trip"),
  start: z.object({ lat: z.number(), lng: z.number() }),
  targetDistanceKm: z.number().min(5).max(500),
  directionBias: z.enum(["any", "north", "east", "south", "west"]).optional(),
  preset: RouteProfilePresetSchema,
  advancedOverrides: RoutingProfileSchema.partial().optional(),
  seed: z.number().int().min(0).optional(),
});

export type RoundTripRequest = z.infer<typeof RoundTripRequestSchema>;

export const RouteRequestSchema = z.union([PointToPointRequestSchema, RoundTripRequestSchema]);

export type RouteRequest = z.infer<typeof RouteRequestSchema>;

export const CueEntrySchema = z.object({
  index: z.number().int(),
  distanceFromStartMeters: z.number(),
  distanceFromPreviousMeters: z.number(),
  maneuver: z.string(),
  streetName: z.string().optional(),
  text: z.string(),
  coordinate: z.tuple([z.number(), z.number()]),
});

export type CueEntry = z.infer<typeof CueEntrySchema>;

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
  generatedWaypoints: z.array(WaypointSchema).optional(),
  cueSheet: z.array(CueEntrySchema).default([]),
});

export type RouteResult = z.infer<typeof RouteResultSchema>;

export const PlanningMetadataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("round_trip"),
    targetDistanceKm: z.number(),
    directionBias: z.enum(["any", "north", "east", "south", "west"]).optional(),
  }),
  z.object({
    mode: z.literal("gpx_import"),
    sourceFilename: z.string(),
    importedAt: z.string().datetime(),
  }),
]);

export type PlanningMetadata = z.infer<typeof PlanningMetadataSchema>;

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
  cueSheet: z.array(CueEntrySchema).default([]),
  planningMetadata: PlanningMetadataSchema.optional(),
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
  cueSheet: z.array(CueEntrySchema).default([]),
  planningMetadata: PlanningMetadataSchema.optional(),
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
  cueSheet: z.array(CueEntrySchema).optional(),
});

export const GpxImportRequestSchema = z.object({
  gpxText: z.string().min(1),
  filename: z.string().max(260),
});

export const GpxImportResponseSchema = z.object({
  waypoints: z.array(WaypointSchema),
  importedAt: z.string().datetime(),
  filename: z.string(),
  pointCount: z.number().int().nonnegative(),
  simplified: z.boolean(),
});

export type SavedRoute = z.infer<typeof SavedRouteSchema>;
export type CreateRouteRequest = z.infer<typeof CreateRouteRequestSchema>;
export type UpdateRouteRequest = z.infer<typeof UpdateRouteRequestSchema>;
export type ListRoutesResponse = z.infer<typeof ListRoutesResponseSchema>;
export type GpxPreviewRequest = z.infer<typeof GpxPreviewRequestSchema>;
export type GpxImportRequest = z.infer<typeof GpxImportRequestSchema>;
export type GpxImportResponse = z.infer<typeof GpxImportResponseSchema>;

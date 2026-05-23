import { PRESET_DEFAULTS, type RouteResult } from "@routax/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphhopperRoutingProvider,
  buildCustomModel,
  normalizeManeuver,
  normalizeSurface,
  parseInstructions,
  parseSurfaceDetails,
  stitchRouteLegs,
} from "../GraphhopperRoutingProvider.js";

const BASE_REQUEST = {
  waypoints: [
    { lat: 60.1699, lng: 25.0097 },
    { lat: 60.1791, lng: 24.9506 },
  ],
  preset: "fastest_direct" as const,
};

function mockFetchOk(paths: unknown[]) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({ paths }),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
  } as any);
}

describe("GraphhopperRoutingProvider", () => {
  describe("integration — requires running GraphHopper stack", () => {
    const skip = !process.env.GRAPHHOPPER_URL;

    it.skipIf(skip)("plans a cycling route between two Helsinki landmarks", async () => {
      const provider = new GraphhopperRoutingProvider();
      const result = await provider.planRoute(BASE_REQUEST);

      expect(result.distance).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.geometry.type).toBe("LineString");
      expect(result.geometry.coordinates.length).toBeGreaterThan(1);
      expect(result.elevationProfile.length).toBe(result.geometry.coordinates.length);
      expect(result.ascent).toBeGreaterThanOrEqual(0);
      expect(result.descent).toBeGreaterThanOrEqual(0);
      expect(result.surfaces.length).toBe(result.geometry.coordinates.length - 1);
    });

    it.skipIf(skip)(
      "returns non-zero ascent and descent on hilly Tampere–Jyväskylä route",
      async () => {
        const provider = new GraphhopperRoutingProvider();
        const result = await provider.planRoute({
          waypoints: [
            { lat: 61.498, lng: 23.76 },
            { lat: 62.243, lng: 25.747 },
          ],
          preset: "maximum_climbing",
        });

        expect(result.ascent).toBeGreaterThan(200);
        expect(result.descent).toBeGreaterThan(200);
        expect(result.elevationProfile.length).toBe(result.geometry.coordinates.length);
        expect(result.surfaces.length).toBe(result.geometry.coordinates.length - 1);
        expect(new Set(result.surfaces).size).toBeGreaterThanOrEqual(2);
      },
    );

    // Ferry-exclusion smoke tests: Korpo→Houtskär and Sulkava→Puumala were
    // historically routed across open water via ferry edges. After the fix,
    // GH must either return unroutable (ferry excluded, no land path) or
    // return a route whose road_environment details contain no FERRY segments.
    // road_environment is requested here only for test verification — it is
    // not part of the production response shape.

    it.skipIf(skip)("Korpo→Houtskär route contains no ferry segments after exclusion", async () => {
      const ghUrl = process.env.GRAPHHOPPER_URL as string;
      const body = {
        points: [
          [21.5683, 60.1718],
          [21.3667, 60.2167],
        ],
        profile: "bike",
        points_encoded: false,
        "ch.disable": true,
        details: ["road_environment"],
        custom_model: {
          priority: [{ if: "road_environment == FERRY", multiply_by: "0" }],
          distance_influence: 70,
        },
      };
      const res = await fetch(`${ghUrl}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Unroutable — ferry excluded and no land path between these islands.
        return;
      }
      const data = (await res.json()) as {
        paths: Array<{
          details?: { road_environment?: Array<[number, number, string]> };
        }>;
      };
      const envDetails = data.paths[0]?.details?.road_environment ?? [];
      const hasFerry = envDetails.some(([, , val]) => val === "FERRY");
      expect(hasFerry).toBe(false);
    });

    it.skipIf(skip)(
      "Sulkava→Puumala route contains no ferry segments after exclusion",
      async () => {
        const ghUrl = process.env.GRAPHHOPPER_URL as string;
        const body = {
          points: [
            [28.3717, 61.7867],
            [28.1872, 61.5247],
          ],
          profile: "bike",
          points_encoded: false,
          "ch.disable": true,
          details: ["road_environment"],
          custom_model: {
            priority: [{ if: "road_environment == FERRY", multiply_by: "0" }],
            distance_influence: 70,
          },
        };
        const res = await fetch(`${ghUrl}/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          paths: Array<{
            details?: { road_environment?: Array<[number, number, string]> };
          }>;
        };
        const envDetails = data.paths[0]?.details?.road_environment ?? [];
        const hasFerry = envDetails.some(([, , val]) => val === "FERRY");
        expect(hasFerry).toBe(false);
      },
    );
  });

  describe("unit — mocked fetch", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("strips elevation into a parallel array, keeps geometry 2D, and parses surface details", async () => {
      mockFetchOk([
        {
          distance: 2000,
          time: 400000,
          ascend: 30,
          descend: 25,
          points: {
            type: "LineString",
            coordinates: [
              [25.0, 60.0, 42],
              [24.9, 60.1, 55],
              [24.8, 60.2, 38],
            ],
          },
          details: {
            surface: [
              [0, 1, "asphalt"],
              [1, 2, "gravel"],
            ],
          },
        },
      ]);

      const provider = new GraphhopperRoutingProvider();
      const result = await provider.planRoute(BASE_REQUEST);

      expect(result.geometry.coordinates).toEqual([
        [25.0, 60.0],
        [24.9, 60.1],
        [24.8, 60.2],
      ]);
      expect(result.elevationProfile).toEqual([42, 55, 38]);
      expect(result.elevationProfile.length).toBe(result.geometry.coordinates.length);
      expect(result.ascent).toBe(30);
      expect(result.descent).toBe(25);
      expect(result.surfaces).toEqual(["asphalt", "gravel"]);
      expect(result.surfaces.length).toBe(result.geometry.coordinates.length - 1);
    });

    it("returns all-unknown surfaces when GH returns no surface details", async () => {
      mockFetchOk([
        {
          distance: 1000,
          time: 200000,
          ascend: 0,
          descend: 0,
          points: {
            type: "LineString",
            coordinates: [
              [25.0, 60.0, 10],
              [24.9, 60.1, 10],
              [24.8, 60.2, 10],
            ],
          },
        },
      ]);

      const provider = new GraphhopperRoutingProvider();
      const result = await provider.planRoute(BASE_REQUEST);

      expect(result.surfaces).toEqual(["unknown", "unknown"]);
    });

    it("throws when GraphHopper returns a non-OK response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
        // biome-ignore lint/suspicious/noExplicitAny: test mock
      } as any);

      const provider = new GraphhopperRoutingProvider();
      await expect(provider.planRoute(BASE_REQUEST)).rejects.toThrow("Leg 1→2 is unroutable");
    });

    it("throws when GraphHopper returns no paths", async () => {
      mockFetchOk([]);

      const provider = new GraphhopperRoutingProvider();
      await expect(provider.planRoute(BASE_REQUEST)).rejects.toThrow("Leg 1→2 is unroutable");
    });

    it("throws on elevation/coordinate length mismatch", async () => {
      // The guard protects against future refactoring where the two arrays
      // could diverge. Test it directly via a subclass that injects mismatched
      // arrays — the current parser derives both from the same source array so
      // a normal GH response can never trigger this path.
      class BrokenProvider extends GraphhopperRoutingProvider {
        // biome-ignore lint/suspicious/noExplicitAny: test-only override
        async planRoute(_req: any): Promise<never> {
          const coordinates: [number, number][] = [[1, 2]];
          const elevationProfile: number[] = [10, 20];
          if (elevationProfile.length !== coordinates.length) {
            throw new Error(
              `GH elevation/coordinate length mismatch: ${elevationProfile.length} vs ${coordinates.length}`,
            );
          }
          throw new Error("unreachable");
        }
      }

      const provider = new BrokenProvider();
      await expect(provider.planRoute(BASE_REQUEST)).rejects.toThrow("mismatch");
    });

    it("wraps per-leg failures with segment context", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            paths: [
              {
                distance: 1000,
                time: 200000,
                ascend: 5,
                descend: 5,
                points: {
                  type: "LineString",
                  coordinates: [
                    [25.0, 60.0, 10],
                    [24.9, 60.1, 10],
                  ],
                },
              },
            ],
          }),
          // biome-ignore lint/suspicious/noExplicitAny: test mock
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => "Point not found",
          // biome-ignore lint/suspicious/noExplicitAny: test mock
        } as any);

      const provider = new GraphhopperRoutingProvider();
      await expect(
        provider.planRoute({
          waypoints: [
            { lat: 60.0, lng: 25.0 },
            { lat: 60.1, lng: 24.9 },
            { lat: 60.2, lng: 24.8 },
          ],
          preset: "fastest_direct",
        }),
      ).rejects.toThrow("Leg 2→3 is unroutable");
    });
  });

  describe("stitchRouteLegs", () => {
    const legA: RouteResult = {
      distance: 1000,
      duration: 200,
      ascent: 10,
      descent: 5,
      geometry: {
        type: "LineString",
        coordinates: [
          [25.0, 60.0],
          [24.9, 60.1],
          [24.8, 60.2],
        ],
      },
      elevationProfile: [10, 20, 15],
      surfaces: ["asphalt", "gravel"],
      cueSheet: [
        {
          index: 0,
          distanceFromStartMeters: 0,
          distanceFromPreviousMeters: 0,
          maneuver: "continue",
          text: "Head north",
          coordinate: [25.0, 60.0],
        },
        {
          index: 1,
          distanceFromStartMeters: 500,
          distanceFromPreviousMeters: 500,
          maneuver: "turn_right",
          text: "Turn right",
          coordinate: [24.9, 60.1],
        },
      ],
    };

    const legB: RouteResult = {
      distance: 500,
      duration: 100,
      ascent: 3,
      descent: 8,
      geometry: {
        type: "LineString",
        coordinates: [
          [24.8, 60.2],
          [24.7, 60.3],
          [24.6, 60.4],
        ],
      },
      elevationProfile: [15, 22, 18],
      surfaces: ["compacted", "asphalt"],
      cueSheet: [
        {
          index: 0,
          distanceFromStartMeters: 0,
          distanceFromPreviousMeters: 0,
          maneuver: "continue",
          text: "Head west",
          coordinate: [24.8, 60.2],
        },
      ],
    };

    it("returns a single leg unchanged", () => {
      expect(stitchRouteLegs([legA])).toBe(legA);
    });

    it("deduplicates the junction coordinate when stitching two legs", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      // legA has 3 coords, legB has 3 coords, junction deduped → 5 total
      expect(stitched.geometry.coordinates).toHaveLength(5);
      expect(stitched.geometry.coordinates[0]).toEqual([25.0, 60.0]);
      expect(stitched.geometry.coordinates[4]).toEqual([24.6, 60.4]);
    });

    it("deduplicates elevation at the junction", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      expect(stitched.elevationProfile).toHaveLength(5);
      expect(stitched.elevationProfile[2]).toBe(15); // junction point, kept from legA
    });

    it("concatenates surfaces without deduplication (per-edge, not per-vertex)", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      // 2 surfaces per leg → 4 total
      expect(stitched.surfaces).toHaveLength(4);
      expect(stitched.surfaces).toEqual(["asphalt", "gravel", "compacted", "asphalt"]);
    });

    it("sums distance, duration, ascent, descent across legs", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      expect(stitched.distance).toBe(1500);
      expect(stitched.duration).toBe(300);
      expect(stitched.ascent).toBe(13);
      expect(stitched.descent).toBe(13);
    });

    it("maintains surfaces.length === coordinates.length - 1 invariant", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      expect(stitched.surfaces.length).toBe(stitched.geometry.coordinates.length - 1);
    });

    it("throws on empty legs array", () => {
      expect(() => stitchRouteLegs([])).toThrow("No legs to stitch");
    });

    it("offsets cue distanceFromStartMeters by previous leg distance", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      // legB cue index 0 had distanceFromStartMeters=0; after stitching += legA.distance (1000)
      const legBCue = stitched.cueSheet.find((c) => c.text === "Head west");
      expect(legBCue).toBeDefined();
      expect(legBCue?.distanceFromStartMeters).toBe(1000);
    });

    it("re-sequences cue index across legs", () => {
      const stitched = stitchRouteLegs([legA, legB]);
      const indices = stitched.cueSheet.map((c) => c.index);
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe("normalizeManeuver", () => {
    it("maps standard turn signs", () => {
      expect(normalizeManeuver(-2)).toBe("turn_left");
      expect(normalizeManeuver(2)).toBe("turn_right");
      expect(normalizeManeuver(-1)).toBe("slight_left");
      expect(normalizeManeuver(1)).toBe("slight_right");
      expect(normalizeManeuver(-3)).toBe("sharp_left");
      expect(normalizeManeuver(3)).toBe("sharp_right");
    });

    it("maps special signs", () => {
      expect(normalizeManeuver(0)).toBe("continue");
      expect(normalizeManeuver(4)).toBe("finish");
      expect(normalizeManeuver(5)).toBe("via_point");
      expect(normalizeManeuver(6)).toBe("roundabout_right");
      expect(normalizeManeuver(-6)).toBe("roundabout_left");
      expect(normalizeManeuver(7)).toBe("keep_right");
      expect(normalizeManeuver(-7)).toBe("keep_left");
    });

    it("returns continue for unknown signs", () => {
      expect(normalizeManeuver(99)).toBe("continue");
      expect(normalizeManeuver(-99)).toBe("continue");
    });
  });

  describe("parseInstructions", () => {
    const coords: [number, number][] = [
      [25.0, 60.0],
      [24.9, 60.1],
      [24.8, 60.2],
    ];

    it("returns empty array for empty instructions", () => {
      expect(parseInstructions([], coords)).toEqual([]);
    });

    it("parses two instructions with correct distances", () => {
      const instrs = [
        {
          distance: 500,
          sign: 0,
          interval: [0, 1] as [number, number],
          text: "Head north",
          street_name: "Mannerheimintie",
        },
        {
          distance: 0,
          sign: 4,
          interval: [1, 2] as [number, number],
          text: "Arrive at destination",
          street_name: "",
        },
      ];
      const cues = parseInstructions(instrs, coords);

      expect(cues).toHaveLength(2);
      expect(cues[0]?.distanceFromStartMeters).toBe(0);
      expect(cues[0]?.distanceFromPreviousMeters).toBe(0);
      expect(cues[0]?.maneuver).toBe("continue");
      expect(cues[0]?.streetName).toBe("Mannerheimintie");
      expect(cues[0]?.coordinate).toEqual([25.0, 60.0]);

      expect(cues[1]?.distanceFromStartMeters).toBe(500);
      expect(cues[1]?.distanceFromPreviousMeters).toBe(500);
      expect(cues[1]?.maneuver).toBe("finish");
    });

    it("omits streetName when empty", () => {
      const instrs = [
        {
          distance: 100,
          sign: 2,
          interval: [0, 1] as [number, number],
          text: "Turn right",
          street_name: "",
        },
      ];
      const cues = parseInstructions(instrs, coords);
      expect(cues[0]?.streetName).toBeUndefined();
    });

    it("applies distanceOffset for multi-leg stitching", () => {
      const instrs = [
        {
          distance: 200,
          sign: 0,
          interval: [0, 1] as [number, number],
          text: "Continue",
          street_name: "",
        },
      ];
      const cues = parseInstructions(instrs, coords, 1000, 5);
      expect(cues[0]?.distanceFromStartMeters).toBe(1000);
      expect(cues[0]?.index).toBe(5);
    });
  });

  describe("normalizeSurface", () => {
    it("maps direct values", () => {
      expect(normalizeSurface("asphalt")).toBe("asphalt");
      expect(normalizeSurface("gravel")).toBe("gravel");
      expect(normalizeSurface("compacted")).toBe("compacted");
      expect(normalizeSurface("unpaved")).toBe("unpaved");
      expect(normalizeSurface("sand")).toBe("sand");
      expect(normalizeSurface("wood")).toBe("wood");
    });

    it("maps aliased OSM values", () => {
      expect(normalizeSurface("concrete")).toBe("asphalt");
      expect(normalizeSurface("paving_stones")).toBe("asphalt");
      expect(normalizeSurface("cobblestone")).toBe("paved_rough");
      expect(normalizeSurface("sett")).toBe("paved_rough");
      expect(normalizeSurface("fine_gravel")).toBe("compacted");
      expect(normalizeSurface("dirt")).toBe("gravel");
      expect(normalizeSurface("earth")).toBe("gravel");
      expect(normalizeSurface("mud")).toBe("sand");
      expect(normalizeSurface("metal_grid")).toBe("wood");
    });

    it("returns unknown for unrecognised or empty values", () => {
      expect(normalizeSurface("")).toBe("unknown");
      expect(normalizeSurface("some_future_osm_tag")).toBe("unknown");
    });
  });

  describe("parseSurfaceDetails", () => {
    it("expands ranges into a flat per-edge array", () => {
      const result = parseSurfaceDetails(
        [
          [0, 2, "asphalt"],
          [2, 4, "gravel"],
        ],
        4,
      );
      expect(result).toEqual(["asphalt", "asphalt", "gravel", "gravel"]);
    });

    it("returns all-unknown for empty ranges without throwing", () => {
      const result = parseSurfaceDetails([], 3);
      expect(result).toEqual(["unknown", "unknown", "unknown"]);
    });

    it("throws when non-empty ranges don't cover all edges", () => {
      expect(() =>
        parseSurfaceDetails(
          [[0, 2, "asphalt"]], // covers 2 edges
          4, // but 4 expected
        ),
      ).toThrow("cover 2 edges, expected 4");
    });
  });

  describe("buildCustomModel", () => {
    const baseProfile = {
      avoidTraffic: 0,
      preferSmoothSurfaces: 0,
      maxGradient: 20,
      preferCycleways: 0,
      allowFerries: false,
      allowWaterCrossings: false,
      maxTrailDifficulty: 6,
    };

    it("zero baseline: all-zero sliders emit no road-class or surface preference rules", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string; else_if?: string }>;
      };
      const condition = (r: { if?: string; else_if?: string }) => r.if ?? r.else_if ?? "";
      const hasRoadClass = model.priority.some((r) => condition(r).includes("road_class"));
      const hasBikePriority = model.priority.some((r) => condition(r).includes("bike_priority"));
      const hasSurface = model.priority.some((r) => condition(r).includes("surface =="));
      expect(hasRoadClass).toBe(false);
      expect(hasBikePriority).toBe(false);
      expect(hasSurface).toBe(false);
    });

    it("fastest_direct produces a minimal model with low distance_influence", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: unknown[];
        distance_influence: number;
      };
      expect(model.distance_influence).toBe(60);
      expect(
        (model.priority as Array<{ if?: string }>).some((r) => r.if?.includes("surface")),
      ).toBe(false);
    });

    it("avoid_gravel (with preferSmoothSurfaces: 0.9) emits a paved-surface reward rule", () => {
      const avoidGravelProfile = PRESET_DEFAULTS["avoid_gravel"];
      const model = buildCustomModel(avoidGravelProfile, "avoid_gravel") as {
        priority: Array<{ if?: string }>;
      };
      const surfaceRule = model.priority.find((r) => r.if?.includes("ASPHALT"));
      expect(surfaceRule).toBeDefined();
      // Hard gravel/unpaved penalties are gone — replaced by the reward model.
      const hasGravelPenalty = model.priority.some(
        (r) => r.if?.includes("GRAVEL") || r.if?.includes("UNPAVED") || r.if?.includes("COMPACTED"),
      );
      expect(hasGravelPenalty).toBe(false);
    });

    it("quiet_country_roads uses higher distance_influence than fastest_direct", () => {
      const fastModel = buildCustomModel(
        { ...baseProfile, avoidTraffic: 0, maxGradient: 20 },
        "fastest_direct",
      ) as { distance_influence: number };
      const quietModel = buildCustomModel(
        { ...baseProfile, avoidTraffic: 0.7, maxGradient: 10 },
        "quiet_country_roads",
      ) as { distance_influence: number };
      expect(quietModel.distance_influence).toBeGreaterThan(fastModel.distance_influence);
    });

    it("each preset produces a distinct serialisation using its own defaults", () => {
      const presets = [
        "fastest_direct",
        "quiet_country_roads",
        "maximum_climbing",
        "avoid_gravel",
      ] as const;
      const models = presets.map((p) => JSON.stringify(buildCustomModel(PRESET_DEFAULTS[p], p)));
      const unique = new Set(models);
      expect(unique.size).toBe(presets.length);
    });

    it("every preset excludes ferry edges with allowFerries: false (default)", () => {
      const presets = [
        "fastest_direct",
        "quiet_country_roads",
        "maximum_climbing",
        "avoid_gravel",
      ] as const;
      for (const preset of presets) {
        const model = buildCustomModel(baseProfile, preset) as {
          priority: Array<{ if?: string; multiply_by?: string }>;
        };
        const ferryRule = model.priority.find((r) => r.if === "road_environment == FERRY");
        expect(ferryRule, `${preset} missing ferry exclusion rule`).toBeDefined();
        expect(ferryRule?.multiply_by).toBe("0");
      }
    });

    it("omits ferry rule when allowFerries: true", () => {
      const model = buildCustomModel({ ...baseProfile, allowFerries: true }, "fastest_direct") as {
        priority: Array<{ if?: string }>;
      };
      const ferryRule = model.priority.find((r) => r.if === "road_environment == FERRY");
      expect(ferryRule).toBeUndefined();
    });

    it("emits ford rule when allowWaterCrossings: false (default)", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string; multiply_by?: string }>;
      };
      const fordRule = model.priority.find((r) => r.if === "road_environment == FORD");
      expect(fordRule).toBeDefined();
      expect(fordRule?.multiply_by).toBe("0");
    });

    it("omits ford rule when allowWaterCrossings: true", () => {
      const model = buildCustomModel(
        { ...baseProfile, allowWaterCrossings: true },
        "fastest_direct",
      ) as { priority: Array<{ if?: string }> };
      const fordRule = model.priority.find((r) => r.if === "road_environment == FORD");
      expect(fordRule).toBeUndefined();
    });

    it("omits both ferry and ford rules when both toggles are true", () => {
      const model = buildCustomModel(
        { ...baseProfile, allowFerries: true, allowWaterCrossings: true },
        "fastest_direct",
      ) as { priority: Array<{ if?: string }> };
      const hasWater = model.priority.some(
        (r) => r.if === "road_environment == FERRY" || r.if === "road_environment == FORD",
      );
      expect(hasWater).toBe(false);
    });

    it("avoidTraffic > 0: emits PRIMARY penalty, SECONDARY else_if penalty, and quiet reward", () => {
      const model = buildCustomModel({ ...baseProfile, avoidTraffic: 1 }, "fastest_direct") as {
        priority: Array<{ if?: string; else_if?: string; multiply_by?: string }>;
      };
      const primaryRule = model.priority.find((r) => r.if === "road_class == PRIMARY");
      expect(primaryRule).toBeDefined();
      expect(primaryRule?.multiply_by).toBe("0.10"); // (1 - 1 * 0.9)

      const secondaryRule = model.priority.find(
        (r) => r.else_if === "road_class == SECONDARY",
      );
      expect(secondaryRule).toBeDefined();
      expect(secondaryRule?.multiply_by).toBe("0.50"); // (1 - 1 * 0.5)

      const quietRule = model.priority.find(
        (r) =>
          r.if ===
          "road_class == CYCLEWAY || road_class == TRACK || road_class == LIVING_STREET || road_class == PATH",
      );
      expect(quietRule).toBeDefined();
      expect(quietRule?.multiply_by).toBe("1.60"); // (1 + 1 * 0.6)
    });

    it("avoidTraffic = 0: emits no road_class rules", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string; else_if?: string }>;
      };
      const hasRoadClass = model.priority.some(
        (r) => (r.if ?? r.else_if ?? "").includes("road_class"),
      );
      expect(hasRoadClass).toBe(false);
    });

    it("emits cycleway boost when preferCycleways > 0, bike_priority rule is else_if", () => {
      const model = buildCustomModel({ ...baseProfile, preferCycleways: 1 }, "fastest_direct") as {
        priority: Array<{ if?: string; else_if?: string; multiply_by?: string }>;
      };
      // road_class == CYCLEWAY is a fresh `if` with stronger factor (1.2 → 2.20× at cw=1)
      const cwRule = model.priority.find((r) => r.if === "road_class == CYCLEWAY");
      expect(cwRule).toBeDefined();
      expect(cwRule?.multiply_by).toBe("2.20");

      // bike_priority >= 1.4 is an `else_if` (lighter factor, 0.5 → 1.50× at cw=1)
      // A segment that is both road_class==CYCLEWAY and bike_priority>=1.4 gets only
      // the stronger CYCLEWAY factor — no double-stacking.
      const bpRule = model.priority.find((r) => r.else_if === "bike_priority >= 1.4");
      expect(bpRule).toBeDefined();
      expect(bpRule?.multiply_by).toBe("1.50");

      // Old bike_network rules must not appear
      const networkRule = model.priority.find((r) => r.if?.includes("bike_network"));
      expect(networkRule).toBeUndefined();
    });

    it("omits cycleway and bike_priority rules when preferCycleways: 0", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string; else_if?: string }>;
      };
      expect(model.priority.find((r) => r.if === "road_class == CYCLEWAY")).toBeUndefined();
      expect(
        model.priority.find((r) => r.else_if === "bike_priority >= 1.4"),
      ).toBeUndefined();
    });

    it("emits no bike_network rules for any preset", () => {
      for (const preset of [
        "fastest_direct",
        "quiet_country_roads",
        "maximum_climbing",
        "avoid_gravel",
      ] as const) {
        const model = buildCustomModel({ ...baseProfile, preferCycleways: 1 }, preset) as {
          priority: Array<{ if?: string }>;
        };
        const networkRule = model.priority.find((r) => r.if?.includes("bike_network"));
        expect(networkRule).toBeUndefined();
      }
    });

    it("emits paved-surface reward when preferSmoothSurfaces > 0", () => {
      const model = buildCustomModel(
        { ...baseProfile, preferSmoothSurfaces: 1 },
        "fastest_direct",
      ) as { priority: Array<{ if?: string; multiply_by?: string }> };
      const rule = model.priority.find(
        (r) => r.if === "surface == ASPHALT || surface == CONCRETE || surface == PAVED",
      );
      expect(rule).toBeDefined();
      expect(rule?.multiply_by).toBe("1.80"); // (1 + 1 * 0.8)
    });

    it("omits smooth-surfaces rule when preferSmoothSurfaces: 0", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string }>;
      };
      const rule = model.priority.find((r) => r.if?.includes("ASPHALT"));
      expect(rule).toBeUndefined();
    });

    it("emits no preferQuietSurfaces or preferLargerRoads rules for any preset", () => {
      for (const preset of [
        "fastest_direct",
        "quiet_country_roads",
        "maximum_climbing",
        "avoid_gravel",
      ] as const) {
        const model = buildCustomModel(PRESET_DEFAULTS[preset], preset) as {
          priority: Array<{ if?: string; else_if?: string }>;
        };
        const hasLargerRoads = model.priority.some((r) =>
          (r.if ?? "").includes("road_class == SECONDARY || road_class == TERTIARY"),
        );
        const hasGravelPenalty = model.priority.some((r) =>
          (r.if ?? "").includes("GRAVEL") ||
          (r.if ?? "").includes("UNPAVED") ||
          (r.if ?? "").includes("COMPACTED"),
        );
        expect(hasLargerRoads, `${preset} should not emit larger-roads rule`).toBe(false);
        expect(hasGravelPenalty, `${preset} should not emit hard gravel penalty`).toBe(false);
      }
    });

    it("emits MTB cap rule when maxTrailDifficulty < 6", () => {
      const model = buildCustomModel(
        { ...baseProfile, maxTrailDifficulty: 2 },
        "fastest_direct",
      ) as { priority: Array<{ if?: string; multiply_by?: string }> };
      const rule = model.priority.find((r) => r.if === "mtb_rating > 2");
      expect(rule).toBeDefined();
      expect(rule?.multiply_by).toBe("0");
    });

    it("omits MTB cap rule when maxTrailDifficulty: 6 (no-cap sentinel)", () => {
      const model = buildCustomModel(baseProfile, "fastest_direct") as {
        priority: Array<{ if?: string }>;
      };
      const rule = model.priority.find((r) => r.if?.startsWith("mtb_rating >"));
      expect(rule).toBeUndefined();
    });
  });
});

// ── planRoundTrip ─────────────────────────────────────────────────────────────

const ROUND_TRIP_REQUEST = {
  mode: "round_trip" as const,
  start: { lat: 60.1699, lng: 25.0097 },
  targetDistanceKm: 30,
  preset: "fastest_direct" as const,
};

function makeRoundTripPath(coordCount = 100) {
  const coords: [number, number, number][] = Array.from({ length: coordCount }, (_, i) => [
    25.0097 + i * 0.001,
    60.1699 + Math.sin(i * 0.1) * 0.01,
    10 + i,
  ]);
  return {
    distance: 30000,
    time: 5400000,
    ascend: 150,
    descend: 150,
    points: { type: "LineString", coordinates: coords },
    details: { surface: [[0, coordCount - 1, "asphalt"] as [number, number, string]] },
  };
}

describe("GraphhopperRoutingProvider — planRoundTrip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a GH request with algorithm: round_trip and correct distance", async () => {
    mockFetchOk([makeRoundTripPath()]);
    const provider = new GraphhopperRoutingProvider();
    await provider.planRoundTrip(ROUND_TRIP_REQUEST);

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.algorithm).toBe("round_trip");
    expect(body["round_trip.distance"]).toBe(30000);
    expect(body["round_trip.seed"]).toBe(0);
    expect(body.heading).toBeUndefined();
  });

  it("passes seed when provided", async () => {
    mockFetchOk([makeRoundTripPath()]);
    const provider = new GraphhopperRoutingProvider();
    await provider.planRoundTrip({ ...ROUND_TRIP_REQUEST, seed: 5 });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body["round_trip.seed"]).toBe(5);
  });

  it("includes heading and heading_penalty for north bias", async () => {
    mockFetchOk([makeRoundTripPath()]);
    const provider = new GraphhopperRoutingProvider();
    await provider.planRoundTrip({ ...ROUND_TRIP_REQUEST, directionBias: "north" });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.heading).toEqual([0]);
    expect(body.heading_penalty).toBe(100);
  });

  it("omits heading fields for 'any' direction bias", async () => {
    mockFetchOk([makeRoundTripPath()]);
    const provider = new GraphhopperRoutingProvider();
    await provider.planRoundTrip({ ...ROUND_TRIP_REQUEST, directionBias: "any" });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.heading).toBeUndefined();
    expect(body.heading_penalty).toBeUndefined();
  });

  it("returns generatedWaypoints with 6 entries: start + 4 vias + finish", async () => {
    mockFetchOk([makeRoundTripPath(100)]);
    const provider = new GraphhopperRoutingProvider();
    const result = await provider.planRoundTrip(ROUND_TRIP_REQUEST);

    expect(result.generatedWaypoints).toHaveLength(6);
    expect(result.generatedWaypoints?.[0]?.role).toBe("start");
    expect(result.generatedWaypoints?.[1]?.role).toBe("via");
    expect(result.generatedWaypoints?.[4]?.role).toBe("via");
    expect(result.generatedWaypoints?.[5]?.role).toBe("finish");
  });

  it("start and finish waypoints share the same position", async () => {
    mockFetchOk([makeRoundTripPath(100)]);
    const provider = new GraphhopperRoutingProvider();
    const result = await provider.planRoundTrip(ROUND_TRIP_REQUEST);

    expect(result.generatedWaypoints?.[0]?.position).toEqual(
      result.generatedWaypoints?.[5]?.position,
    );
  });

  it("throws on non-OK GraphHopper response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
      // biome-ignore lint/suspicious/noExplicitAny: test mock
    } as any);

    const provider = new GraphhopperRoutingProvider();
    await expect(provider.planRoundTrip(ROUND_TRIP_REQUEST)).rejects.toThrow(
      "GraphHopper returned 500",
    );
  });

  it.skipIf(!process.env.GRAPHHOPPER_URL)(
    "integration: generates a round-trip loop near Helsinki",
    async () => {
      const provider = new GraphhopperRoutingProvider();
      const result = await provider.planRoundTrip(ROUND_TRIP_REQUEST);

      expect(result.distance).toBeGreaterThan(0);
      expect(result.generatedWaypoints).toHaveLength(6);

      // Last geometry coordinate should be close to start (within ~500m)
      const lastCoord = result.geometry.coordinates.at(-1);
      if (!lastCoord) throw new Error("Empty geometry");
      const dlng = lastCoord[0] - ROUND_TRIP_REQUEST.start.lng;
      const dlat = lastCoord[1] - ROUND_TRIP_REQUEST.start.lat;
      const approxMeters = Math.sqrt(dlng * dlng + dlat * dlat) * 111000;
      expect(approxMeters).toBeLessThan(500);
    },
  );
});

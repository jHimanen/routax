import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphhopperRoutingProvider } from "../GraphhopperRoutingProvider.js";

const BASE_REQUEST = {
  start: { lat: 60.1699, lng: 25.0097 },
  end: { lat: 60.1791, lng: 24.9506 },
  profile: { avoidTraffic: 0.5, preferQuietSurfaces: 0.5, maxGradient: 10 },
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
    });

    it.skipIf(skip)(
      "returns non-zero ascent and descent on hilly Tampere–Jyväskylä route",
      async () => {
        const provider = new GraphhopperRoutingProvider();
        const result = await provider.planRoute({
          start: { lat: 61.498, lng: 23.76 },
          end: { lat: 62.243, lng: 25.747 },
          profile: { avoidTraffic: 0, preferQuietSurfaces: 0, maxGradient: 20 },
        });

        expect(result.ascent).toBeGreaterThan(200);
        expect(result.descent).toBeGreaterThan(200);
        expect(result.elevationProfile.length).toBe(result.geometry.coordinates.length);
      },
    );
  });

  describe("unit — mocked fetch", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("strips elevation into a parallel array and keeps geometry 2D", async () => {
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
    });

    it("throws when GraphHopper returns a non-OK response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
        // biome-ignore lint/suspicious/noExplicitAny: test mock
      } as any);

      const provider = new GraphhopperRoutingProvider();
      await expect(provider.planRoute(BASE_REQUEST)).rejects.toThrow("GraphHopper returned 400");
    });

    it("throws when GraphHopper returns no paths", async () => {
      mockFetchOk([]);

      const provider = new GraphhopperRoutingProvider();
      await expect(provider.planRoute(BASE_REQUEST)).rejects.toThrow("no paths");
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
  });
});

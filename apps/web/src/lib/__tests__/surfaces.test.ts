import { describe, expect, it } from "vitest";
import { buildSurfaceFeatureCollection, computeSurfaceComposition } from "../surfaces";

// Simple west-to-east line across southern Finland (~equal-length edges)
const COORDS: [number, number][] = [
  [24.0, 60.17],
  [25.0, 60.17],
  [26.0, 60.17],
  [27.0, 60.17],
  [28.0, 60.17],
];

describe("computeSurfaceComposition", () => {
  it("returns empty array for empty surfaces", () => {
    expect(computeSurfaceComposition(COORDS, [])).toEqual([]);
  });

  it("returns 100% for a single surface class", () => {
    const result = computeSurfaceComposition(COORDS, ["asphalt", "asphalt", "asphalt", "asphalt"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.surface).toBe("asphalt");
    expect(result[0]?.percentage).toBe(100);
  });

  it("is distance-weighted, not count-weighted", () => {
    // 4 equal edges: 3 asphalt + 1 gravel → asphalt ~75%, gravel ~25%
    const result = computeSurfaceComposition(COORDS, ["asphalt", "asphalt", "asphalt", "gravel"]);
    const asphalt = result.find((s) => s.surface === "asphalt");
    const gravel = result.find((s) => s.surface === "gravel");
    expect(asphalt?.percentage).toBe(75);
    expect(gravel?.percentage).toBe(25);
  });

  it("sorts descending by distance", () => {
    const result = computeSurfaceComposition(COORDS, ["gravel", "asphalt", "asphalt", "asphalt"]);
    expect(result[0]?.surface).toBe("asphalt");
    expect(result[1]?.surface).toBe("gravel");
  });

  it("percentages sum to approximately 100", () => {
    const result = computeSurfaceComposition(COORDS, ["asphalt", "gravel", "compacted", "unknown"]);
    const sum = result.reduce((acc, s) => acc + s.percentage, 0);
    // rounding may put it at 99-101
    expect(sum).toBeGreaterThanOrEqual(98);
    expect(sum).toBeLessThanOrEqual(102);
  });
});

describe("buildSurfaceFeatureCollection", () => {
  const geometry: GeoJSON.LineString = { type: "LineString", coordinates: COORDS };

  it("returns single feature when surfaces is empty", () => {
    const fc = buildSurfaceFeatureCollection(geometry, []);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties?.surface).toBeUndefined();
  });

  it("returns one feature per contiguous run", () => {
    // 4 edges: [asphalt, asphalt, gravel, gravel]
    const fc = buildSurfaceFeatureCollection(geometry, ["asphalt", "asphalt", "gravel", "gravel"]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]?.properties?.surface).toBe("asphalt");
    expect(fc.features[1]?.properties?.surface).toBe("gravel");
  });

  it("asphalt run has correct coordinate count (3 coords for 2 edges)", () => {
    const fc = buildSurfaceFeatureCollection(geometry, ["asphalt", "asphalt", "gravel", "gravel"]);
    // edges 0-1 → coords[0..2] = 3 points
    expect(fc.features[0]?.geometry.coordinates).toHaveLength(3);
    // edges 2-3 → coords[2..4] = 3 points
    expect(fc.features[1]?.geometry.coordinates).toHaveLength(3);
  });

  it("runs share the boundary coordinate (no gap)", () => {
    const fc = buildSurfaceFeatureCollection(geometry, ["asphalt", "asphalt", "gravel", "gravel"]);
    const lastOfFirst = fc.features[0]?.geometry.coordinates.at(-1);
    const firstOfSecond = fc.features[1]?.geometry.coordinates[0];
    expect(lastOfFirst).toEqual(firstOfSecond);
  });

  it("handles all-same surface as a single feature", () => {
    const fc = buildSurfaceFeatureCollection(geometry, ["gravel", "gravel", "gravel", "gravel"]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties?.surface).toBe("gravel");
  });

  it("handles alternating surfaces (one feature per edge)", () => {
    const fc = buildSurfaceFeatureCollection(geometry, ["asphalt", "gravel", "asphalt", "gravel"]);
    expect(fc.features).toHaveLength(4);
  });
});

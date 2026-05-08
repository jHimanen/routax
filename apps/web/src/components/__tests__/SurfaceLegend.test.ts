/**
 * Logic-level tests for the data that SurfaceLegend renders.
 * The component itself is thin JSX; these tests verify the composition
 * data and palette contract it depends on.
 */
import { describe, expect, it } from "vitest";
import { SURFACE_LABELS, SURFACE_PALETTE, computeSurfaceComposition } from "../../lib/surfaces";

// Mixed-surface route fixture: Helsinki region, roughly equal-length edges
const COORDS: [number, number][] = [
  [24.8, 60.17],
  [24.9, 60.17],
  [25.0, 60.17],
  [25.1, 60.17],
  [25.2, 60.17],
];

describe("SurfaceLegend — legend rows match surfaces present in route", () => {
  it("produces one row per unique surface class in the route", () => {
    const surfaces = ["asphalt", "asphalt", "gravel", "asphalt"] as const;
    const rows = computeSurfaceComposition(COORDS, [...surfaces]);
    const surfacesInRows = rows.map((r) => r.surface);
    expect(surfacesInRows).toContain("asphalt");
    expect(surfacesInRows).toContain("gravel");
    expect(surfacesInRows).toHaveLength(2);
  });

  it("does not produce rows for surface classes not in the route", () => {
    const surfaces = ["compacted", "compacted", "compacted", "compacted"] as const;
    const rows = computeSurfaceComposition(COORDS, [...surfaces]);
    expect(rows.every((r) => r.surface === "compacted")).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("rows are sorted descending — dominant surface appears first", () => {
    // 3 asphalt edges + 1 gravel edge → asphalt first
    const surfaces = ["asphalt", "gravel", "asphalt", "asphalt"] as const;
    const rows = computeSurfaceComposition(COORDS, [...surfaces]);
    expect(rows[0]?.surface).toBe("asphalt");
    expect(rows[1]?.surface).toBe("gravel");
  });

  it("percentages are non-zero for each displayed row", () => {
    const surfaces = ["asphalt", "gravel", "compacted", "unknown"] as const;
    const rows = computeSurfaceComposition(COORDS, [...surfaces]);
    expect(rows.every((r) => r.percentage > 0)).toBe(true);
  });

  it("returns empty array for a route with no surface data (graceful fallback)", () => {
    const rows = computeSurfaceComposition(COORDS, []);
    expect(rows).toHaveLength(0);
  });
});

describe("SurfaceLegend — palette and label completeness", () => {
  const ALL_CLASSES = [
    "asphalt",
    "paved_rough",
    "compacted",
    "gravel",
    "sand",
    "unpaved",
    "wood",
    "unknown",
  ] as const;

  it("SURFACE_PALETTE has a hex color for every SurfaceClass", () => {
    for (const cls of ALL_CLASSES) {
      expect(SURFACE_PALETTE[cls]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("SURFACE_LABELS has a non-empty label for every SurfaceClass", () => {
    for (const cls of ALL_CLASSES) {
      expect(SURFACE_LABELS[cls].length).toBeGreaterThan(0);
    }
  });

  it("palette has at least 4 distinct colours (Tundra surface vocabulary)", () => {
    const colors = ALL_CLASSES.map((cls) => SURFACE_PALETTE[cls]);
    const unique = new Set(colors);
    // Tundra groups surface types into 4 visual categories:
    // paved (pine), loose (ochre), path (lichen), unknown (warm gray).
    // Related types share a colour by design; minimum 4 distinct values required.
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });
});

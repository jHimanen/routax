import { describe, expect, it } from "vitest";
import { buildElevationPathD, cumulativeDistanceKm, indexFromX } from "../elevation";

const COORDS: [number, number][] = [
  [25.0097, 60.1699],
  [25.02, 60.175],
  [25.03, 60.18],
  [25.04, 60.185],
  [25.05, 60.19],
];

const ELEVATIONS = [10, 25, 40, 30, 15];

describe("cumulativeDistanceKm", () => {
  it("starts at 0 and grows monotonically", () => {
    const cum = cumulativeDistanceKm(COORDS);
    expect(cum[0]).toBe(0);
    for (let i = 1; i < cum.length; i++) {
      const prev = cum[i - 1] ?? 0;
      const curr = cum[i] ?? 0;
      expect(curr).toBeGreaterThan(prev);
    }
    expect(cum).toHaveLength(COORDS.length);
  });
});

describe("buildElevationPathD", () => {
  it("produces a stable SVG path for fixed input", () => {
    const cum = cumulativeDistanceKm(COORDS);
    const d = buildElevationPathD(cum, ELEVATIONS, 200, 60);
    expect(d).toMatchInlineSnapshot(
      `"M0.00,52.50L50.94,30.00L100.63,7.50L150.32,22.50L200.00,45.00"`,
    );
  });

  it("returns empty string for fewer than 2 points", () => {
    expect(buildElevationPathD([0], [100], 200, 60)).toBe("");
  });

  it("enforces a minimum 50 m y-range on flat input", () => {
    const flatCoords: [number, number][] = [
      [25.0, 60.0],
      [25.01, 60.0],
    ];
    const cum = cumulativeDistanceKm(flatCoords);
    const d = buildElevationPathD(cum, [100, 102], 200, 60);
    // With only 2 m delta the 50 m floor kicks in; the y-diff should be a small
    // fraction of the chart height (not nearly the full height it would be without the floor).
    const ys = d
      .replace(/M|L/g, " ")
      .trim()
      .split(" ")
      .map((pt) => Number(pt.split(",")[1] ?? "0"));
    // 2 m in a 50 m floor range ≈ 17% of chart height — well under 50%.
    expect(Math.abs((ys[0] ?? 0) - (ys[1] ?? 0))).toBeLessThan(30);
  });
});

describe("indexFromX", () => {
  const makeRect = (left: number, width: number): DOMRect =>
    ({ left, width, top: 0, bottom: 0, right: left + width, height: 0, x: left, y: 0 }) as DOMRect;

  it("returns 0 at x=left edge", () => {
    const cum = cumulativeDistanceKm(COORDS);
    expect(indexFromX(0, makeRect(0, 200), cum)).toBe(0);
  });

  it("returns last index at x=right edge", () => {
    const cum = cumulativeDistanceKm(COORDS);
    expect(indexFromX(200, makeRect(0, 200), cum)).toBe(COORDS.length - 1);
  });

  it("returns nearest index at midpoint", () => {
    const cum = cumulativeDistanceKm(COORDS);
    const _total = cum[cum.length - 1];
    // x at exactly 50% of width → closest point to totalDist/2
    const midX = 100;
    const idx = indexFromX(midX, makeRect(0, 200), cum);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(COORDS.length);
  });

  it("returns -1 for empty cumDist", () => {
    expect(indexFromX(100, makeRect(0, 200), [])).toBe(-1);
  });
});

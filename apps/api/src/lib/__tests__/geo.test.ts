import { describe, expect, it } from "vitest";
import { anchorJitter, bearingToLatLng, generateAnchorBearings } from "../geo.js";

const HELSINKI = { lat: 60.162951, lng: 24.943668 };

function approxDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

describe("bearingToLatLng", () => {
  it("going north increases latitude", () => {
    const dest = bearingToLatLng(HELSINKI, 0, 10_000);
    expect(dest.lat).toBeGreaterThan(HELSINKI.lat);
    expect(Math.abs(dest.lng - HELSINKI.lng)).toBeLessThan(0.001);
  });

  it("going east increases longitude", () => {
    const dest = bearingToLatLng(HELSINKI, 90, 10_000);
    expect(dest.lng).toBeGreaterThan(HELSINKI.lng);
    expect(Math.abs(dest.lat - HELSINKI.lat)).toBeLessThan(0.01);
  });

  it("going south decreases latitude", () => {
    const dest = bearingToLatLng(HELSINKI, 180, 10_000);
    expect(dest.lat).toBeLessThan(HELSINKI.lat);
  });

  it("going west decreases longitude", () => {
    const dest = bearingToLatLng(HELSINKI, 270, 10_000);
    expect(dest.lng).toBeLessThan(HELSINKI.lng);
  });

  it("round-trip distance is within 1% of requested distance", () => {
    for (const distance of [1_000, 10_000, 50_000, 200_000]) {
      for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const dest = bearingToLatLng(HELSINKI, bearing, distance);
        const actualDist = approxDistanceMeters(HELSINKI, dest);
        expect(Math.abs(actualDist - distance) / distance).toBeLessThan(0.01);
      }
    }
  });
});

describe("generateAnchorBearings", () => {
  it("returns exactly k bearings", () => {
    for (const k of [2, 3, 4]) {
      expect(generateAnchorBearings(k, "any", 0)).toHaveLength(k);
    }
  });

  it("any: k=3 bearings are approximately 120° apart", () => {
    const bearings = generateAnchorBearings(3, "any", 0);
    const [a, b, c] = bearings as [number, number, number];
    const diff1 = ((b - a + 360) % 360);
    const diff2 = ((c - b + 360) % 360);
    expect(diff1).toBeCloseTo(120, 0);
    expect(diff2).toBeCloseTo(120, 0);
  });

  it("any: same seed produces the same bearings (deterministic)", () => {
    expect(generateAnchorBearings(3, "any", 5)).toEqual(generateAnchorBearings(3, "any", 5));
  });

  it("any: different seeds produce different bearings", () => {
    const a = generateAnchorBearings(3, "any", 0);
    const b = generateAnchorBearings(3, "any", 1);
    expect(a).not.toEqual(b);
  });

  it("north bias: all bearings lie in the northern 180° arc (270°–360° and 0°–90°)", () => {
    for (let seed = 0; seed < 5; seed++) {
      const bearings = generateAnchorBearings(3, "north", seed);
      for (const b of bearings) {
        const normalised = ((b % 360) + 360) % 360;
        // In northern arc: 270°–360° or 0°–90°
        const inArc = normalised >= 270 || normalised <= 90;
        expect(inArc).toBe(true);
      }
    }
  });

  it("south bias: all bearings lie in the southern 180° arc (90°–270°)", () => {
    for (let seed = 0; seed < 5; seed++) {
      const bearings = generateAnchorBearings(3, "south", seed);
      for (const b of bearings) {
        const normalised = ((b % 360) + 360) % 360;
        expect(normalised).toBeGreaterThanOrEqual(90);
        expect(normalised).toBeLessThanOrEqual(270);
      }
    }
  });

  it("east bias: all bearings lie in the eastern arc (0°–180°)", () => {
    for (let seed = 0; seed < 5; seed++) {
      const bearings = generateAnchorBearings(3, "east", seed);
      for (const b of bearings) {
        const normalised = ((b % 360) + 360) % 360;
        expect(normalised).toBeGreaterThanOrEqual(0);
        expect(normalised).toBeLessThanOrEqual(180);
      }
    }
  });

  it("west bias: all bearings lie in the western arc (180°–360°)", () => {
    for (let seed = 0; seed < 5; seed++) {
      const bearings = generateAnchorBearings(3, "west", seed);
      for (const b of bearings) {
        const normalised = ((b % 360) + 360) % 360;
        expect(normalised).toBeGreaterThanOrEqual(180);
        expect(normalised).toBeLessThanOrEqual(360);
      }
    }
  });

  it("compass bias: same seed is deterministic", () => {
    expect(generateAnchorBearings(3, "north", 3)).toEqual(generateAnchorBearings(3, "north", 3));
  });
});

describe("anchorJitter", () => {
  it("is deterministic for the same inputs", () => {
    const a = anchorJitter(42, 1, 3);
    const b = anchorJitter(42, 1, 3);
    expect(a).toEqual(b);
  });

  it("bearingDelta is within ±10°", () => {
    for (let seed = 0; seed < 10; seed++) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const { bearingDelta } = anchorJitter(seed, 0, attempt);
        expect(bearingDelta).toBeGreaterThanOrEqual(-10);
        expect(bearingDelta).toBeLessThanOrEqual(10);
      }
    }
  });

  it("radiusFactor is within [0.8, 1.2]", () => {
    for (let seed = 0; seed < 10; seed++) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const { radiusFactor } = anchorJitter(seed, 0, attempt);
        expect(radiusFactor).toBeGreaterThanOrEqual(0.8);
        expect(radiusFactor).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it("different attempts produce different jitter", () => {
    const a = anchorJitter(0, 0, 0);
    const b = anchorJitter(0, 0, 1);
    expect(a.bearingDelta).not.toBeCloseTo(b.bearingDelta, 5);
  });
});

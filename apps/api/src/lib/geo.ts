const EARTH_RADIUS_M = 6_371_000;

const BIAS_HEADINGS: Record<string, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

// Simple multiplicative LCG — deterministic, not cryptographic.
function seededRandom(seed: number): number {
  const s = Math.abs(((seed + 1) * 1_664_525 + 1_013_904_223) & 0xffffffff);
  return s / 0x100000000;
}

// Derive a sequence of pseudo-random values from a composite key.
function prng(seed: number, anchorIdx: number, attempt: number, slot: number): number {
  return seededRandom(seed * 97 + anchorIdx * 1_000 + attempt * 7 + slot);
}

/**
 * Project a destination point from a start position along a bearing.
 * bearingDeg: 0 = North, 90 = East, 180 = South, 270 = West.
 */
export function bearingToLatLng(
  start: { lat: number; lng: number },
  bearingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const φ1 = (start.lat * Math.PI) / 180;
  const λ1 = (start.lng * Math.PI) / 180;
  const θ = (bearingDeg * Math.PI) / 180;
  const δ = distanceMeters / EARTH_RADIUS_M;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return {
    lat: (φ2 * 180) / Math.PI,
    lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180, // normalise to −180…+180
  };
}

/**
 * Generate k anchor bearings for a round-trip loop.
 *
 * - "any": k evenly-spaced bearings, rotated by a seed-driven offset so every seed
 *   gives a distinct orientation.
 * - compass bias: k bearings spread within a 180° arc centered on the bias heading,
 *   so the loop visibly leans that direction without collapsing to an out-and-back.
 *   Seed drives a small rotation within the arc.
 */
export function generateAnchorBearings(k: number, directionBias: string, seed: number): number[] {
  const biasHeading = BIAS_HEADINGS[directionBias];

  if (biasHeading === undefined) {
    // "any": evenly spaced, seed-driven rotation
    const baseAngle = (seed * 137.5) % 360;
    const step = 360 / k;
    return Array.from({ length: k }, (_, i) => (baseAngle + i * step) % 360);
  }

  // Compass bias: 180° arc centered on the bias heading.
  // Arc runs from biasHeading−90° to biasHeading+90°.
  // Seed drives a small ±15° rotation so successive seeds don't stack identically.
  const seedOffset = (seededRandom(seed) - 0.5) * 30; // ±15°
  const arcStart = biasHeading - 90 + seedOffset;
  const step = 180 / (k + 1);
  return Array.from({ length: k }, (_, i) => (((arcStart + step * (i + 1)) % 360) + 360) % 360);
}

/**
 * Compute a deterministic bearing jitter for the given (seed, anchor, attempt).
 * Returns an object with bearingDelta (°, ±10) and radiusFactor ([0.8, 1.2]).
 */
export function anchorJitter(
  seed: number,
  anchorIdx: number,
  attempt: number,
): { bearingDelta: number; radiusFactor: number } {
  const bearingDelta = (prng(seed, anchorIdx, attempt, 0) - 0.5) * 20; // ±10°
  const radiusFactor = 0.8 + prng(seed, anchorIdx, attempt, 1) * 0.4; // [0.8, 1.2]
  return { bearingDelta, radiusFactor };
}

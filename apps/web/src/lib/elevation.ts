const DEG_TO_RAD = Math.PI / 180;
const EARTH_KM = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * DEG_TO_RAD;
  const dLng = (b[0] - a[0]) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(a[1] * DEG_TO_RAD) * Math.cos(b[1] * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Returns cumulative distance array in km, starting at 0. Length matches coords.length. */
export function cumulativeDistanceKm(coords: [number, number][]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    result.push(result[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  return result;
}

const MIN_Y_RANGE = 50;
const Y_HEADROOM = 0.1;

/**
 * Builds an SVG path `d` string for an elevation polyline mapped into a
 * [0, w] × [0, h] coordinate space where y=0 is the top.
 */
export function buildElevationPathD(
  cumDist: number[],
  elevations: number[],
  w: number,
  h: number,
): string {
  if (elevations.length < 2) return "";

  const minE = Math.min(...elevations);
  const maxE = Math.max(...elevations);
  const rawRange = maxE - minE;
  const range = Math.max(rawRange, MIN_Y_RANGE);
  const headroom = range * Y_HEADROOM;
  const yLo = minE - headroom;
  const yHi = maxE + headroom;
  const ySpan = yHi - yLo;

  const totalDist = cumDist[cumDist.length - 1] || 1;

  const pts = elevations.map((e, i) => {
    const x = (cumDist[i] / totalDist) * w;
    const y = h - ((e - yLo) / ySpan) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return `M${pts.join("L")}`;
}

/**
 * Maps a pointer clientX to the nearest elevation point index.
 * Returns -1 if cumDist is empty.
 */
export function indexFromX(clientX: number, rect: DOMRect, cumDist: number[]): number {
  if (cumDist.length === 0) return -1;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const totalDist = cumDist[cumDist.length - 1] || 1;
  const targetDist = ratio * totalDist;

  let best = 0;
  let bestDiff = Math.abs(cumDist[0] - targetDist);
  for (let i = 1; i < cumDist.length; i++) {
    const diff = Math.abs(cumDist[i] - targetDist);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

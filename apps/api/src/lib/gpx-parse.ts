import type { Waypoint } from "@routax/shared";

export class GpxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpxParseError";
  }
}

interface RawPoint {
  lat: number;
  lng: number;
  ele?: number;
}

function extractAttr(tag: string, name: string): number | null {
  const m = tag.match(new RegExp(`${name}="([^"]+)"`));
  if (!m) return null;
  const v = Number.parseFloat(m[1] ?? "");
  return Number.isNaN(v) ? null : v;
}

export function parseGpxPoints(xml: string): RawPoint[] {
  const hasTrack = /<trkpt[\s>]/.test(xml);
  const hasRoute = /<rtept[\s>]/.test(xml);

  if (!hasTrack && !hasRoute) {
    throw new GpxParseError("No track or route points found in GPX file.");
  }

  const tagName = hasTrack ? "trkpt" : "rtept";
  const tagRe = new RegExp(`<${tagName}([^>]+)>([\\s\\S]*?)<\\/${tagName}>`, "g");

  const points: RawPoint[] = [];
  for (let m = tagRe.exec(xml); m !== null; m = tagRe.exec(xml)) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const lat = extractAttr(attrs, "lat");
    const lng = extractAttr(attrs, "lon");
    if (lat === null || lng === null) continue;
    const eleM = inner.match(/<ele>([^<]+)<\/ele>/);
    const ele = eleM ? Number.parseFloat(eleM[1] ?? "") : undefined;
    points.push({ lat, lng, ele: ele !== undefined && !Number.isNaN(ele) ? ele : undefined });
  }

  if (points.length === 0) {
    throw new GpxParseError("GPX file contains no readable coordinate points.");
  }

  return points;
}

// Keeps first, last, and evenly-spaced interior items up to `max` total.
export function uniformSample<T>(pts: T[], max: number): T[] {
  if (pts.length <= max) return pts;
  const result: T[] = [];
  const step = (pts.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    const item = pts[Math.min(idx, pts.length - 1)];
    if (item !== undefined) result.push(item);
  }
  return result;
}

const MAX_WAYPOINTS = 20;

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function normalizeToWaypoints(points: RawPoint[]): Waypoint[] {
  const sampled = uniformSample(points, MAX_WAYPOINTS);
  return sampled.map((p, i) => ({
    id: makeId(),
    position: { lat: p.lat, lng: p.lng },
    role: i === 0 ? "start" : i === sampled.length - 1 ? "finish" : "via",
  }));
}

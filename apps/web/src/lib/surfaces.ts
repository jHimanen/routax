import type { SurfaceClass } from "@routax/shared";

export const SURFACE_PALETTE: Record<SurfaceClass, string> = {
  asphalt: "#3a4a38", // pine — smooth paved
  paved_rough: "#4a5f48", // lighter pine — worn paved
  compacted: "#9aa982", // lichen — hardpack/compacted gravel
  gravel: "#c2682a", // ochre — off-road accent
  sand: "#c2682a", // ochre — sandy tracks
  unpaved: "#b05025", // deep ochre — raw unpaved dirt
  wood: "#9aa982", // lichen — boardwalk/path
  unknown: "#c5bca7", // warm gray
};

export const SURFACE_LABELS: Record<SurfaceClass, string> = {
  asphalt: "Asphalt",
  paved_rough: "Paved (rough)",
  compacted: "Compacted",
  gravel: "Gravel",
  sand: "Sand",
  unpaved: "Unpaved",
  wood: "Boardwalk",
  unknown: "Unknown",
};

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

export interface SurfaceSegment {
  surface: SurfaceClass;
  distanceKm: number;
  percentage: number;
}

/**
 * Distance-weighted composition of a route's surface classes.
 * surfaces[i] describes the edge between coords[i] and coords[i+1].
 * Returned array is sorted descending by distance.
 */
export function computeSurfaceComposition(
  coords: [number, number][],
  surfaces: SurfaceClass[],
): SurfaceSegment[] {
  if (surfaces.length === 0 || coords.length < 2) return [];

  const distByClass = new Map<SurfaceClass, number>();
  let totalKm = 0;

  for (let i = 0; i < surfaces.length; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const surface = surfaces[i];
    if (!a || !b || !surface) continue;
    const d = haversineKm(a, b);
    distByClass.set(surface, (distByClass.get(surface) ?? 0) + d);
    totalKm += d;
  }

  if (totalKm === 0) return [];

  return Array.from(distByClass.entries())
    .map(([surface, distanceKm]) => ({
      surface,
      distanceKm,
      percentage: Math.round((distanceKm / totalKm) * 100),
    }))
    .sort((a, b) => b.distanceKm - a.distanceKm);
}

/**
 * Converts a route LineString + per-edge surface array into a GeoJSON
 * FeatureCollection where each feature covers a contiguous run of the same
 * surface class. Features carry a `surface` string property consumed by the
 * MapLibre ["match"] paint expression.
 *
 * When surfaces is empty a single feature with no surface property is returned,
 * which lets the MapLibre fallback colour (blue) take effect unchanged.
 */
export function buildSurfaceFeatureCollection(
  geometry: GeoJSON.LineString,
  surfaces: SurfaceClass[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords = geometry.coordinates as [number, number][];

  if (surfaces.length === 0 || coords.length < 2) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    };
  }

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  let runStart = 0;
  let currentSurface = surfaces[0] as SurfaceClass;

  for (let i = 1; i < surfaces.length; i++) {
    if (surfaces[i] !== currentSurface) {
      features.push({
        type: "Feature",
        properties: { surface: currentSurface },
        geometry: { type: "LineString", coordinates: coords.slice(runStart, i + 1) },
      });
      runStart = i;
      currentSurface = surfaces[i] as SurfaceClass;
    }
  }

  // Final run includes coords[runStart..surfaces.length] inclusive
  features.push({
    type: "Feature",
    properties: { surface: currentSurface },
    geometry: { type: "LineString", coordinates: coords.slice(runStart, surfaces.length + 1) },
  });

  return { type: "FeatureCollection", features };
}

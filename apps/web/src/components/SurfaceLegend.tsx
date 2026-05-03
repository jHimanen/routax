"use client";

import type { SurfaceClass } from "@routax/shared";
import { SURFACE_LABELS, SURFACE_PALETTE, computeSurfaceComposition } from "../lib/surfaces";

interface SurfaceLegendProps {
  surfaces: SurfaceClass[];
  geometry: GeoJSON.LineString;
}

function buildSummary(top: { surface: SurfaceClass; percentage: number }[]): string {
  const first = top[0];
  if (!first) return "";
  if (first.percentage >= 60) {
    const second = top[1];
    if (second) {
      return `Mostly ${SURFACE_LABELS[first.surface].toLowerCase()} with ${SURFACE_LABELS[second.surface].toLowerCase()} sections`;
    }
    return `Mostly ${SURFACE_LABELS[first.surface].toLowerCase()}`;
  }
  const names = top
    .slice(0, 2)
    .map((s) => SURFACE_LABELS[s.surface].toLowerCase())
    .join(" and ");
  return `Mixed: ${names}`;
}

export function SurfaceLegend({ surfaces, geometry }: SurfaceLegendProps): React.JSX.Element {
  if (surfaces.length === 0) {
    return (
      <p className="surface-legend-unavailable">
        Surface breakdown unavailable for routes saved before Phase 3.
      </p>
    );
  }

  const coords = geometry.coordinates as [number, number][];
  const composition = computeSurfaceComposition(coords, surfaces);
  const summary = buildSummary(composition);

  return (
    <div className="surface-legend">
      {summary && <p className="surface-legend-summary">{summary}</p>}
      <ul className="surface-legend-list" aria-label="Surface composition">
        {composition.map(({ surface, distanceKm, percentage }) => (
          <li key={surface} className="surface-legend-row">
            <span
              className="surface-legend-swatch"
              style={{ backgroundColor: SURFACE_PALETTE[surface] }}
              aria-hidden="true"
            />
            <span className="surface-legend-label">{SURFACE_LABELS[surface]}</span>
            <span className="surface-legend-distance">{distanceKm.toFixed(1)} km</span>
            <span className="surface-legend-pct">{percentage}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildElevationPathD, cumulativeDistanceKm, indexFromX } from "../lib/elevation";

interface ElevationProfileProps {
  elevationProfile: number[];
  geometry: GeoJSON.LineString;
  onHoverCoord: (coord: [number, number] | null) => void;
}

const VIEWBOX_W = 200;
const VIEWBOX_H = 60;

export function ElevationProfile({
  elevationProfile,
  geometry,
  onHoverCoord,
}: ElevationProfileProps): React.JSX.Element | null {
  const coords = geometry.coordinates as [number, number][];
  const cumDist = cumulativeDistanceKm(coords);
  const totalKm = cumDist[cumDist.length - 1] ?? 0;
  const pathD = buildElevationPathD(cumDist, elevationProfile, VIEWBOX_W, VIEWBOX_H);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const touchClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset hover when route's elevation data changes
  useEffect(() => {
    setHoverIdx(null);
    onHoverCoord(null);
  }, [elevationProfile, onHoverCoord]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (touchClearRef.current !== null) clearTimeout(touchClearRef.current);
    };
  }, []);

  const applyIdx = useCallback(
    (idx: number) => {
      setHoverIdx(idx);
      const coord = coords[idx];
      if (coord) onHoverCoord(coord);
    },
    [coords, onHoverCoord],
  );

  const clearHover = useCallback(() => {
    setHoverIdx(null);
    onHoverCoord(null);
  }, [onHoverCoord]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyIdx(indexFromX(e.clientX, rect, cumDist));
      });
    },
    [applyIdx, cumDist],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGRectElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (touchClearRef.current !== null) clearTimeout(touchClearRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyIdx(indexFromX(touch.clientX, rect, cumDist));
      });
    },
    [applyIdx, cumDist],
  );

  const handleTouchEnd = useCallback(() => {
    touchClearRef.current = setTimeout(clearHover, 1500);
  }, [clearHover]);

  if (elevationProfile.length < 2 || pathD === "") return null;

  // Compute tracker x in viewBox units
  let trackerX: number | null = null;
  let tooltipElevation: number | null = null;
  if (hoverIdx !== null) {
    const dist = cumDist[hoverIdx] ?? 0;
    trackerX = totalKm > 0 ? (dist / totalKm) * VIEWBOX_W : 0;
    tooltipElevation = elevationProfile[hoverIdx] ?? null;
  }

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Elevation profile"
      className="elevation-profile"
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="none"
    >
      {/* Area fill */}
      <path
        className="elevation-profile-area"
        d={`${pathD}L${VIEWBOX_W},${VIEWBOX_H}L0,${VIEWBOX_H}Z`}
      />
      {/* Elevation line */}
      <path className="elevation-profile-line" d={pathD} />

      {/* X-axis labels — rendered with preserveAspectRatio="xMinYMin meet" override via text */}
      <text
        className="elevation-profile-label"
        x="2"
        y={VIEWBOX_H - 2}
        style={{ fontSize: 7, fill: "#9ca3af", fontFamily: "inherit" }}
      >
        0 km
      </text>
      <text
        className="elevation-profile-label"
        x={VIEWBOX_W - 2}
        y={VIEWBOX_H - 2}
        textAnchor="end"
        style={{ fontSize: 7, fill: "#9ca3af", fontFamily: "inherit" }}
      >
        {totalKm.toFixed(1)} km
      </text>

      {/* Hover tracker */}
      {trackerX !== null && tooltipElevation !== null && (
        <g>
          <line
            className="elevation-profile-tracker"
            x1={trackerX}
            y1={0}
            x2={trackerX}
            y2={VIEWBOX_H}
          />
          <text
            className="elevation-profile-tooltip"
            x={trackerX + (trackerX > VIEWBOX_W * 0.75 ? -3 : 3)}
            y={8}
            textAnchor={trackerX > VIEWBOX_W * 0.75 ? "end" : "start"}
            style={{ fontSize: 8, fill: "#111827", fontFamily: "inherit" }}
          >
            {Math.round(tooltipElevation)} m
          </text>
        </g>
      )}

      {/* Invisible interaction overlay */}
      <rect
        x={0}
        y={0}
        width={VIEWBOX_W}
        height={VIEWBOX_H}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onMouseLeave={clearHover}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}

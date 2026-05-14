"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  type LatLng,
  PRESET_DEFAULTS,
  type PlanningMetadata,
  type RouteProfilePreset,
  type RouteResult,
  type RoutingProfile,
  type SavedRoute,
  type SurfaceClass,
  type Waypoint,
} from "@routax/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useRoute } from "../hooks/useRoute";
import { createRoute, getRoute, importGpx, postRoute } from "../lib/api";
import { SURFACE_PALETTE, buildSurfaceFeatureCollection } from "../lib/surfaces";
import { RoutePanel, formatDuration } from "./RoutePanel";

type PlannerMode = "point_to_point" | "round_trip";
type DirectionBias = "any" | "north" | "east" | "south" | "west";

function routeResultFromSaved(saved: SavedRoute): RouteResult {
  return {
    distance: saved.distance,
    duration: saved.duration,
    geometry: saved.geometry,
    elevationProfile: saved.elevationProfile,
    ascent: saved.ascent,
    descent: saved.descent,
    surfaces: saved.surfaceProfile,
    cueSheet: saved.cueSheet,
  };
}

function profileEqual(a: RoutingProfile, b: RoutingProfile): boolean {
  return (
    a.avoidTraffic === b.avoidTraffic &&
    a.preferQuietSurfaces === b.preferQuietSurfaces &&
    a.maxGradient === b.maxGradient &&
    a.preferCycleNetworks === b.preferCycleNetworks &&
    a.preferLargerRoads === b.preferLargerRoads &&
    a.allowFerries === b.allowFerries &&
    a.allowWaterCrossings === b.allowWaterCrossings &&
    a.maxTrailDifficulty === b.maxTrailDifficulty
  );
}

function waypointsEqual(a: Waypoint[], b: Waypoint[]): boolean {
  if (a.length !== b.length) return false;
  const EPS = 1e-7;
  for (let i = 0; i < a.length; i++) {
    const wa = a[i];
    const wb = b[i];
    if (!wa || !wb) return false;
    if (
      Math.abs(wa.position.lat - wb.position.lat) >= EPS ||
      Math.abs(wa.position.lng - wb.position.lng) >= EPS
    ) {
      return false;
    }
  }
  return true;
}

/** Euclidean squared distance from point p to the segment (a, b). */
function distSqPointToSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.lng - a.lng;
    const ey = p.lat - a.lat;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lenSq));
  const cx = a.lng + t * dx;
  const cy = a.lat + t * dy;
  const fx = p.lng - cx;
  const fy = p.lat - cy;
  return fx * fx + fy * fy;
}

/** Returns the index in waypoints[] after which to insert a new via. */
function findInsertIndex(click: LatLng, waypoints: Waypoint[]): number {
  let minDist = Number.POSITIVE_INFINITY;
  let minIdx = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wA = waypoints[i];
    const wB = waypoints[i + 1];
    if (!wA || !wB) continue;
    const d = distSqPointToSegment(click, wA.position, wB.position);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return minIdx + 1;
}

function getStyleUrl(): string | null {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return null;
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

function makeWaypointId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const MARKER_COLORS: Record<Waypoint["role"], string> = {
  start: "#3a4a38", // pine
  finish: "#c2682a", // ochre
  via: "#7a766b", // muted
};

// MapLibre paint expression: colors route segments by surface class.
// Defined at module scope — derived entirely from the SURFACE_PALETTE constant.
// Cast required: TypeScript cannot verify the dynamically-built tuple matches
// MapLibre's strict ExpressionSpecification discriminated union.
const SURFACE_PAINT_EXPRESSION = [
  "match",
  ["get", "surface"],
  ...Object.entries(SURFACE_PALETTE).flat(),
  "#c2682a", // fallback: features without a surface property render ochre
] as unknown as maplibregl.ExpressionSpecification;

// Re-center button — a MapLibre IControl rendered in the top-right rail.
// The recenter callback is supplied on construction and updated via a stable
// ref in RoutaxMap so the button always calls the latest bounds/padding.
class FitRouteControl implements maplibregl.IControl {
  private container: HTMLElement | null = null;
  private recenter: () => void;

  constructor(recenter: () => void) {
    this.recenter = recenter;
  }

  onAdd(): HTMLElement {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "maplibregl-ctrl-icon fit-route-ctrl-btn";
    btn.title = "Re-center on whole route";
    btn.setAttribute("aria-label", "Re-center on whole route");
    // Frame-corners SVG — square with inward-pointing arrows at each corner
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    btn.addEventListener("click", () => this.recenter());

    this.container.appendChild(btn);
    return this.container;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
  }
}

// ── RoutaxMap ────────────────────────────────────────────────────────────────

interface RoutaxMapProps {
  waypoints: Waypoint[];
  routeGeoJSON: RouteResult["geometry"] | null;
  onMapClick: (lngLat: LatLng, screenPos: { x: number; y: number }) => void;
  onMapLoaded: () => void;
  mapLoaded: boolean;
  hoverCoord: [number, number] | null;
  onWaypointMoved: (id: string, pos: LatLng) => void;
  cursorMode: "crosshair" | "grab";
  surfaces: SurfaceClass[];
  surfaceMapViz: boolean;
  /** When set, the map flies to this coordinate (cue centering). */
  cueCoord: [number, number] | null;
  panelOpen: boolean;
}

function RoutaxMap({
  waypoints,
  routeGeoJSON,
  onMapClick,
  onMapLoaded,
  mapLoaded,
  hoverCoord,
  onWaypointMoved,
  cursorMode,
  surfaces,
  surfaceMapViz,
  cueCoord,
  panelOpen,
}: RoutaxMapProps): React.JSX.Element {
  const FINLAND_CENTER: [number, number] = [25.7482, 61.9241];
  const FINLAND_ZOOM = 4.8;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleUrl = getStyleUrl();

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  });

  const onMapLoadedRef = useRef(onMapLoaded);
  useEffect(() => {
    onMapLoadedRef.current = onMapLoaded;
  });

  const onWaypointMovedRef = useRef(onWaypointMoved);
  useEffect(() => {
    onWaypointMovedRef.current = onWaypointMoved;
  });

  // Fit-once refs — track whether the current route session has been fitted,
  // and hold the latest recenter callback for the FitRouteControl button.
  const prevHadRouteRef = useRef(false);
  const recenterCallbackRef = useRef<() => void>(() => {});
  const panelOpenRef = useRef(panelOpen);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  const fitControlRef = useRef<FitRouteControl | null>(null);

  // Map lifecycle
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !styleUrl) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: FINLAND_CENTER,
      zoom: FINLAND_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: false }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      onMapLoadedRef.current();
    });

    map.on("click", (e) => {
      onMapClickRef.current(
        { lat: e.lngLat.lat, lng: e.lngLat.lng },
        { x: e.point.x, y: e.point.y },
      );
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // Cursor feedback
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = cursorMode;
  }, [cursorMode]);

  // Markers — keep a stable map from id → Marker
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const currentIds = new Set(waypoints.map((w) => w.id));

    // Remove markers no longer in waypoints
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add or update
    for (const wp of waypoints) {
      const existing = markersRef.current.get(wp.id);
      if (existing) {
        existing.setLngLat([wp.position.lng, wp.position.lat]);
      } else {
        const marker = new maplibregl.Marker({
          color: MARKER_COLORS[wp.role],
          draggable: true,
        });
        marker.setLngLat([wp.position.lng, wp.position.lat]).addTo(map);
        const id = wp.id;
        marker.on("dragend", () => {
          const ll = marker.getLngLat();
          onWaypointMovedRef.current(id, { lat: ll.lat, lng: ll.lng });
        });
        markersRef.current.set(id, marker);
      }
    }
  }, [waypoints, mapLoaded]);

  // Route layer
  const SOURCE_ID = "routax-route";
  const LAYER_ID = "routax-route-line";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (routeGeoJSON) {
      const coords = routeGeoJSON.coordinates;
      const lngs = coords.map(([lng]) => lng);
      const lats = coords.map(([, lat]) => lat);
      const bounds: [maplibregl.LngLatLike, maplibregl.LngLatLike] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];

      const activeSurfaces = surfaceMapViz && surfaces.length > 0 ? surfaces : [];
      const geoJSON = buildSurfaceFeatureCollection(routeGeoJSON, activeSurfaces);

      const existing = map.getSource(SOURCE_ID);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(geoJSON);
      } else {
        map.addSource(SOURCE_ID, { type: "geojson", data: geoJSON });
        map.addLayer({
          id: LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": SURFACE_PAINT_EXPRESSION,
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });

        // Widen hit area so hover cursor feedback works near the line
        map.addLayer({
          id: `${LAYER_ID}-hit`,
          type: "line",
          source: SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "transparent", "line-width": 12 },
        });
      }

      // Recenter reads panelOpen via ref so panel-toggle doesn't cause a refit
      const doRecenter = () => {
        const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
        const padding = isMobile
          ? panelOpenRef.current
            ? { top: 60, bottom: 320, left: 60, right: 60 }
            : { top: 60, bottom: 60, left: 60, right: 60 }
          : { top: 60, bottom: 60, left: 290, right: 60 };
        map.fitBounds(bounds, { padding, animate: true });
      };
      recenterCallbackRef.current = doRecenter;

      // Fit once per route session — not on every reroute, drag, or surface toggle
      if (!prevHadRouteRef.current) {
        doRecenter();
        prevHadRouteRef.current = true;
      }
    } else {
      // Route cleared: reset so the next route session fits on first render
      prevHadRouteRef.current = false;
      recenterCallbackRef.current = () => {};
      if (map.getLayer(`${LAYER_ID}-hit`)) map.removeLayer(`${LAYER_ID}-hit`);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }
  }, [routeGeoJSON, mapLoaded, surfaces, surfaceMapViz]);
  // panelOpen intentionally excluded from deps — recenterCallbackRef reads it via panelOpenRef

  // Add / remove the Re-center control in the top-right rail based on route presence
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (routeGeoJSON && !fitControlRef.current) {
      const ctrl = new FitRouteControl(() => recenterCallbackRef.current());
      map.addControl(ctrl, "top-right");
      fitControlRef.current = ctrl;
    } else if (!routeGeoJSON && fitControlRef.current) {
      map.removeControl(fitControlRef.current);
      fitControlRef.current = null;
    }
  }, [routeGeoJSON, mapLoaded]);

  // Elevation hover marker
  const HOVER_SOURCE = "routax-hover";
  const HOVER_LAYER = "routax-hover-dot";

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (hoverCoord) {
      const geoJSON: GeoJSON.Feature<GeoJSON.Point> = {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: hoverCoord },
      };
      const existing = map.getSource(HOVER_SOURCE);
      if (existing) {
        (existing as maplibregl.GeoJSONSource).setData(geoJSON);
      } else {
        map.addSource(HOVER_SOURCE, { type: "geojson", data: geoJSON });
        map.addLayer({
          id: HOVER_LAYER,
          type: "circle",
          source: HOVER_SOURCE,
          paint: {
            "circle-radius": 6,
            "circle-color": "#faf6ec",
            "circle-stroke-color": "#c2682a",
            "circle-stroke-width": 2,
          },
        });
      }
    } else {
      if (map.getLayer(HOVER_LAYER)) map.removeLayer(HOVER_LAYER);
      if (map.getSource(HOVER_SOURCE)) map.removeSource(HOVER_SOURCE);
    }
  }, [hoverCoord, mapLoaded]);

  useEffect(() => {
    if (!cueCoord || !mapRef.current || !mapLoaded) return;
    mapRef.current.flyTo({ center: [cueCoord[0], cueCoord[1]], zoom: 15 });
  }, [cueCoord, mapLoaded]);

  if (!styleUrl) {
    return (
      <section className="map-root">
        <div className="map-error">
          Set <code>NEXT_PUBLIC_MAPTILER_KEY</code> in your env to load the map.
        </div>
      </section>
    );
  }

  return (
    <section className="map-root" aria-label="Finland map">
      <div ref={containerRef} className="map-container" />
    </section>
  );
}

// ── RouteMap ─────────────────────────────────────────────────────────────────

const DEFAULT_PRESET: RouteProfilePreset = "fastest_direct";

export function RouteMap({ initialRouteId }: { initialRouteId?: string } = {}): React.JSX.Element {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [preset, setPreset] = useState<RouteProfilePreset>(DEFAULT_PRESET);
  const [profile, setProfile] = useState<RoutingProfile>(PRESET_DEFAULTS[DEFAULT_PRESET]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [resultOverride, setResultOverride] = useState<RouteResult | null>(null);
  const [loadBaseline, setLoadBaseline] = useState<{
    waypoints: Waypoint[];
    preset: RouteProfilePreset;
    profile: RoutingProfile;
  } | null>(null);
  const [routeModified, setRouteModified] = useState(false);
  const [deepLinkResolved, setDeepLinkResolved] = useState(
    () => !initialRouteId || initialRouteId.trim() === "",
  );

  const [hoverCoord, setHoverCoord] = useState<[number, number] | null>(null);

  const [plannerMode, setPlannerMode] = useState<PlannerMode>("point_to_point");
  const [targetDistanceKm, setTargetDistanceKm] = useState(50);
  const [directionBias, setDirectionBias] = useState<DirectionBias>("any");
  const [roundTripSeed, setRoundTripSeed] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planningMetadata, setPlanningMetadata] = useState<PlanningMetadata | null>(null);

  const { isReady, flags } = useFeatureFlags();
  const savedFlagOn = flags.saved_routes_ui === true;
  const savedRoutesUi = isReady && savedFlagOn;
  const gpxExport = isReady && flags.gpx_export === true;
  const gpxImport = isReady && flags.gpx_import === true;
  const elevationProfileViz = isReady && flags.elevation_profile_viz === true;
  const surfaceMapViz = isReady && flags.surface_visualization === true;
  const cueSheets = isReady && flags.cue_sheets === true;
  const deepLinkLoading = Boolean(initialRouteId?.trim()) && !deepLinkResolved;

  const [importStatus, setImportStatus] = useState<{
    phase: "importing" | "simplified" | "error";
    message: string;
  } | null>(null);

  const [cueCoord, setCueCoord] = useState<[number, number] | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [repositionTarget, setRepositionTarget] = useState<"start" | "finish" | null>(null);
  const [clickMenu, setClickMenu] = useState<{
    lngLat: LatLng;
    screenX: number;
    screenY: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement | null>(null);

  const { result, isLoading, error } = useRoute(waypoints, preset, profile, {
    resultOverride,
  });

  const mobileStatusText = (() => {
    if (repositionTarget !== null)
      return `Tap map to move ${repositionTarget === "start" ? "Start" : "Finish"}`;
    if (result && result.distance > 0) {
      return `${(result.distance / 1000).toFixed(1)} km · ${formatDuration(result.duration)}`;
    }
    if (waypoints.length > 0)
      return `${waypoints.length} waypoint${waypoints.length !== 1 ? "s" : ""}`;
    return "Tap map to place start";
  })();

  const applySavedRoute = useCallback((saved: SavedRoute) => {
    let restoredWaypoints: Waypoint[];

    if (saved.waypoints && saved.waypoints.length >= 2) {
      restoredWaypoints = saved.waypoints;
    } else {
      // Legacy route: derive start/finish from geometry
      const coords = saved.geometry.coordinates;
      if (coords.length < 2) return;
      const a = coords[0] as [number, number];
      const b = coords[coords.length - 1] as [number, number];
      restoredWaypoints = [
        { id: makeWaypointId(), position: { lat: a[1], lng: a[0] }, role: "start" },
        { id: makeWaypointId(), position: { lat: b[1], lng: b[0] }, role: "finish" },
      ];
    }

    setWaypoints(restoredWaypoints);
    setPreset(saved.preset);
    setProfile({ ...saved.profile });
    setResultOverride(routeResultFromSaved(saved));
    setLoadBaseline({
      waypoints: restoredWaypoints,
      preset: saved.preset,
      profile: { ...saved.profile },
    });
    setRouteModified(false);
    setPlanningMetadata(saved.planningMetadata ?? null);
  }, []);

  useEffect(() => {
    if (!initialRouteId || initialRouteId.trim() === "") return;
    if (!isReady) return;
    if (!savedFlagOn) {
      setDeepLinkResolved(true);
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const r = await getRoute(initialRouteId, ac.signal);
        if (!cancelled && r) applySavedRoute(r);
      } catch {
        // 404/validation handled by getRoute; network errors fall through
      } finally {
        if (!cancelled) setDeepLinkResolved(true);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [initialRouteId, isReady, savedFlagOn, applySavedRoute]);

  // Modification detection when a saved route is loaded
  useEffect(() => {
    if (!resultOverride || !loadBaseline) return;
    if (waypoints.length === 0) return;
    if (
      waypointsEqual(waypoints, loadBaseline.waypoints) &&
      preset === loadBaseline.preset &&
      profileEqual(profile, loadBaseline.profile)
    ) {
      return;
    }
    setResultOverride(null);
    setLoadBaseline(null);
    setRouteModified(true);
    setPlanningMetadata(null);
  }, [waypoints, preset, profile, resultOverride, loadBaseline]);

  const handleSave = useCallback(
    async (name: string) => {
      if (!result) throw new Error("No route to save");
      const created = await createRoute({
        name,
        preset,
        profile,
        geometry: result.geometry,
        distance: Math.round(result.distance),
        duration: Math.round(result.duration),
        ascent: Math.round(result.ascent),
        descent: Math.round(result.descent),
        elevationProfile: result.elevationProfile,
        surfaceProfile: result.surfaces,
        waypoints,
        cueSheet: result.cueSheet,
        planningMetadata: planningMetadata ?? undefined,
      });
      return created.id;
    },
    [result, preset, profile, waypoints, planningMetadata],
  );

  const handleCueSelect = useCallback(([lng, lat]: [number, number]) => {
    setCueCoord([lng, lat]);
  }, []);

  const handleGpxImport = useCallback(async (file: File) => {
    setImportStatus({ phase: "importing", message: "Importing…" });
    try {
      const text = await file.text();
      const res = await importGpx(text, file.name);
      setResultOverride(null);
      setLoadBaseline(null);
      setRouteModified(false);
      setPlannerMode("point_to_point");
      setRoundTripSeed(0);
      setPlanningMetadata({
        mode: "gpx_import",
        sourceFilename: res.filename,
        importedAt: res.importedAt,
      });
      setWaypoints(res.waypoints);
      setImportStatus(
        res.simplified
          ? {
              phase: "simplified",
              message: `Simplified from ${res.pointCount.toLocaleString()} points to ${res.waypoints.length} waypoints.`,
            }
          : null,
      );
    } catch (e) {
      setImportStatus({
        phase: "error",
        message: e instanceof Error ? e.message : "Import failed",
      });
    }
  }, []);

  const handleReset = useCallback(() => {
    setWaypoints([]);
    setResultOverride(null);
    setLoadBaseline(null);
    setRouteModified(false);
    setPlanningMetadata(null);
    setRoundTripSeed(0);
  }, []);

  const handleStartReposition = useCallback(
    (role: "start" | "finish") => {
      setRepositionTarget(role);
      if (panelOpen && window.innerWidth <= 640) setPanelOpen(false);
    },
    [panelOpen],
  );

  const handleCancelReposition = useCallback(() => setRepositionTarget(null), []);

  const handleMapClick = useCallback(
    (lngLat: LatLng, screenPos: { x: number; y: number }) => {
      // Reposition banner flow: next click moves the target endpoint without opening the menu
      if (repositionTarget !== null) {
        setWaypoints((prev) =>
          prev.map((w) => (w.role === repositionTarget ? { ...w, position: lngLat } : w)),
        );
        setRepositionTarget(null);
        return;
      }

      if (initialRouteId && !deepLinkResolved) return;

      // Round-trip mode: any click places or replaces the single start point — no menu
      if (plannerMode === "round_trip") {
        setWaypoints([{ id: makeWaypointId(), position: lngLat, role: "start" }]);
        return;
      }

      const hasStart = waypoints.some((w) => w.role === "start");
      const hasFinish = waypoints.some((w) => w.role === "finish");

      if (hasStart && hasFinish) {
        // Both endpoints present — open explicit context menu instead of implicitly inserting
        setClickMenu({ lngLat, screenX: screenPos.x, screenY: screenPos.y });
        return;
      }

      // Cold-start: place start (first click) or finish (second click)
      setWaypoints((prev) => {
        if (prev.length === 0) {
          return [{ id: makeWaypointId(), position: lngLat, role: "start" }];
        }
        if (prev.length === 1) {
          return [...prev, { id: makeWaypointId(), position: lngLat, role: "finish" }];
        }
        return prev;
      });
    },
    [initialRouteId, deepLinkResolved, plannerMode, repositionTarget, waypoints],
  );

  const handleAddVia = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const last = prev.at(-1);
      const secondLast = prev.at(-2);
      if (!last || !secondLast) return prev;
      const newVia: Waypoint = {
        id: makeWaypointId(),
        position: {
          lat: (last.position.lat + secondLast.position.lat) / 2,
          lng: (last.position.lng + secondLast.position.lng) / 2,
        },
        role: "via",
      };
      return [...prev.slice(0, -1), newVia, last];
    });
  }, []);

  const handleRemoveVia = useCallback((id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleMoveViaUp = useCallback((id: string) => {
    setWaypoints((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx <= 1) return prev; // can't move above start
      const next = [...prev];
      const a = next[idx];
      const b = next[idx - 1];
      if (a !== undefined && b !== undefined) {
        next[idx - 1] = a;
        next[idx] = b;
      }
      return next;
    });
  }, []);

  const handleMoveViaDown = useCallback((id: string) => {
    setWaypoints((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0 || idx >= prev.length - 2) return prev; // can't move below finish
      const next = [...prev];
      const a = next[idx];
      const b = next[idx + 1];
      if (a !== undefined && b !== undefined) {
        next[idx] = b;
        next[idx + 1] = a;
      }
      return next;
    });
  }, []);

  const handleWaypointMoved = useCallback((id: string, pos: LatLng) => {
    setWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, position: pos } : w)));
  }, []);

  const handleGenerateRoundTrip = useCallback(
    async (regenerate: boolean) => {
      const startWp = waypoints.find((w) => w.role === "start");
      if (!startWp) return;

      const nextSeed = regenerate ? roundTripSeed + 1 : 0;
      if (regenerate) setRoundTripSeed(nextSeed);

      setIsGenerating(true);
      try {
        const res = await postRoute({
          mode: "round_trip",
          start: startWp.position,
          targetDistanceKm,
          directionBias: directionBias !== "any" ? directionBias : undefined,
          preset,
          advancedOverrides: profile,
          seed: nextSeed,
        });

        const gw = res.generatedWaypoints ?? [];
        if (gw.length < 2) return;

        setWaypoints(gw);
        setResultOverride(res);
        setLoadBaseline({ waypoints: gw, preset, profile });
        setRouteModified(false);
        setPlanningMetadata({
          mode: "round_trip",
          targetDistanceKm,
          directionBias: directionBias !== "any" ? directionBias : undefined,
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [waypoints, roundTripSeed, targetDistanceKm, directionBias, preset, profile],
  );

  const handleMenuAddWaypoint = useCallback((lngLat: LatLng) => {
    setClickMenu(null);
    setWaypoints((prev) => {
      if (prev.length < 2) return prev;
      const insertAt = findInsertIndex(lngLat, prev);
      const newVia: Waypoint = { id: makeWaypointId(), position: lngLat, role: "via" };
      const next = [...prev];
      next.splice(insertAt, 0, newVia);
      return next;
    });
  }, []);

  const handleMenuMoveStart = useCallback((lngLat: LatLng) => {
    setClickMenu(null);
    setWaypoints((prev) => prev.map((w) => (w.role === "start" ? { ...w, position: lngLat } : w)));
  }, []);

  const handleMenuMoveFinish = useCallback((lngLat: LatLng) => {
    setClickMenu(null);
    setWaypoints((prev) =>
      prev.map((w) => (w.role === "finish" ? { ...w, position: lngLat } : w)),
    );
  }, []);

  // Escape clears all waypoints (when menu is not open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !clickMenu) handleReset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleReset, clickMenu]);

  // Close click menu on outside-click or Escape
  useEffect(() => {
    if (!clickMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClickMenu(null);
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setClickMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [clickMenu]);

  // Focus first menu item when menu opens; arrow-key navigation within menu
  useEffect(() => {
    if (!clickMenu || !menuRef.current) return;
    firstMenuItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clickMenu]);

  const cursorMode =
    repositionTarget !== null
      ? "crosshair"
      : plannerMode === "round_trip"
        ? "crosshair"
        : waypoints.length < 2
          ? "crosshair"
          : "grab";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <RoutaxMap
        waypoints={waypoints}
        routeGeoJSON={result?.geometry ?? null}
        onMapClick={handleMapClick}
        onMapLoaded={() => setMapLoaded(true)}
        mapLoaded={mapLoaded}
        hoverCoord={hoverCoord}
        onWaypointMoved={handleWaypointMoved}
        cursorMode={cursorMode}
        surfaces={result?.surfaces ?? []}
        surfaceMapViz={surfaceMapViz}
        cueCoord={cueCoord}
        panelOpen={panelOpen}
      />
      <RoutePanel
        waypoints={waypoints}
        preset={preset}
        onPresetChange={(p) => {
          setPreset(p);
          setProfile(PRESET_DEFAULTS[p]);
        }}
        isCustom={profile !== PRESET_DEFAULTS[preset]}
        profile={profile}
        onProfileChange={setProfile}
        result={result}
        isLoading={isLoading}
        error={error}
        onReset={handleReset}
        savedRoutesUi={savedRoutesUi}
        onSave={handleSave}
        onSelectSaved={applySavedRoute}
        savedReadMode={resultOverride !== null}
        routeModified={routeModified}
        deepLinkLoading={deepLinkLoading}
        gpxExport={gpxExport}
        gpxImport={gpxImport}
        onImportGpx={(file) => void handleGpxImport(file)}
        importStatus={importStatus}
        elevationProfileViz={elevationProfileViz}
        surfaceMapViz={surfaceMapViz}
        cueSheets={cueSheets}
        onCueSelect={handleCueSelect}
        onElevationHover={setHoverCoord}
        onAddVia={handleAddVia}
        onRemoveVia={handleRemoveVia}
        onMoveViaUp={handleMoveViaUp}
        onMoveViaDown={handleMoveViaDown}
        plannerMode={plannerMode}
        onPlannerModeChange={(m) => {
          setPlannerMode(m);
          handleReset();
        }}
        targetDistanceKm={targetDistanceKm}
        onTargetDistanceChange={setTargetDistanceKm}
        directionBias={directionBias}
        onDirectionBiasChange={setDirectionBias}
        onGenerate={() => void handleGenerateRoundTrip(false)}
        onRegenerate={() => void handleGenerateRoundTrip(true)}
        isGenerating={isGenerating}
        hasRoundTripStart={
          plannerMode === "round_trip" && waypoints.some((w) => w.role === "start")
        }
        planningMetadata={planningMetadata}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((p) => !p)}
        repositionTarget={repositionTarget}
        onStartReposition={handleStartReposition}
        onCancelReposition={handleCancelReposition}
      />
      {!panelOpen && (
        <button
          type="button"
          className="mobile-panel-toggle"
          onClick={() => setPanelOpen(true)}
          aria-expanded={false}
          aria-label="Open route panel"
        >
          Plan
        </button>
      )}
      {!panelOpen && (
        <div className="route-panel-status-chip" aria-live="polite">
          {mobileStatusText}
        </div>
      )}
      {clickMenu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Map actions"
          className="map-click-menu"
          style={{
            position: "fixed",
            left: Math.min(clickMenu.screenX, window.innerWidth - 168),
            top: Math.min(clickMenu.screenY, window.innerHeight - 148),
          }}
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            className="map-click-menu-item"
            onClick={() => handleMenuAddWaypoint(clickMenu.lngLat)}
          >
            Add waypoint
          </button>
          <button
            type="button"
            role="menuitem"
            className="map-click-menu-item"
            onClick={() => handleMenuMoveStart(clickMenu.lngLat)}
          >
            Move start here
          </button>
          <button
            type="button"
            role="menuitem"
            className="map-click-menu-item"
            onClick={() => handleMenuMoveFinish(clickMenu.lngLat)}
          >
            Move finish here
          </button>
        </div>
      )}
    </div>
  );
}

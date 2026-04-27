"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng, RouteResult, RoutingProfile, SavedRoute } from "@routax/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFeatureFlag } from "../hooks/useFeatureFlag";
import { useRoute } from "../hooks/useRoute";
import { createRoute } from "../lib/api";

function routeResultFromSaved(saved: SavedRoute): RouteResult {
  return {
    distance: saved.distance,
    duration: saved.duration,
    geometry: saved.geometry,
    elevationProfile: saved.elevationProfile,
    ascent: saved.ascent,
    descent: saved.descent,
  };
}

const EPS = 1e-7;
function latLngEqual(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < EPS && Math.abs(a.lng - b.lng) < EPS;
}

function profileEqual(a: RoutingProfile, b: RoutingProfile): boolean {
  return (
    a.avoidTraffic === b.avoidTraffic &&
    a.preferQuietSurfaces === b.preferQuietSurfaces &&
    a.maxGradient === b.maxGradient
  );
}
import { RoutePanel } from "./RoutePanel";

const FINLAND_CENTER: [number, number] = [25.7482, 61.9241];
const FINLAND_ZOOM = 4.8;

function getStyleUrl(): string | null {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return null;
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

// ── RoutaxMap ────────────────────────────────────────────────────────────────

interface RoutaxMapProps {
  start: LatLng | null;
  end: LatLng | null;
  routeGeoJSON: RouteResult["geometry"] | null;
  onMapClick: (lngLat: LatLng) => void;
  onMapLoaded: () => void;
  mapLoaded: boolean;
}

function RoutaxMap({
  start,
  end,
  routeGeoJSON,
  onMapClick,
  onMapLoaded,
  mapLoaded,
}: RoutaxMapProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleUrl = getStyleUrl();

  // Keep callbacks fresh in the long-lived map event handlers.
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  });

  const onMapLoadedRef = useRef(onMapLoaded);
  useEffect(() => {
    onMapLoadedRef.current = onMapLoaded;
  });

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
      onMapClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  // Cursor feedback
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = start === null || end === null ? "crosshair" : "grab";
  }, [start, end]);

  // Markers
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!startMarkerRef.current) {
      startMarkerRef.current = new maplibregl.Marker({ color: "#22c55e" });
    }
    if (!endMarkerRef.current) {
      endMarkerRef.current = new maplibregl.Marker({ color: "#ef4444" });
    }

    if (start) {
      startMarkerRef.current.setLngLat([start.lng, start.lat]).addTo(map);
    } else {
      startMarkerRef.current.remove();
    }

    if (end) {
      endMarkerRef.current.setLngLat([end.lng, end.lat]).addTo(map);
    } else {
      endMarkerRef.current.remove();
    }
  }, [start, end, mapLoaded]);

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

      const geoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: routeGeoJSON,
      };

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
            "line-color": "#3b82f6",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }

      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 290, right: 60 },
        animate: true,
      });
    } else {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }
  }, [routeGeoJSON, mapLoaded]);

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

const DEFAULT_PROFILE: RoutingProfile = {
  avoidTraffic: 0,
  preferQuietSurfaces: 0,
  maxGradient: 20,
};

export function RouteMap(): React.JSX.Element {
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [profile, setProfile] = useState<RoutingProfile>(DEFAULT_PROFILE);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [resultOverride, setResultOverride] = useState<RouteResult | null>(null);
  const [loadBaseline, setLoadBaseline] = useState<{
    start: LatLng;
    end: LatLng;
    profile: RoutingProfile;
  } | null>(null);
  const [routeModified, setRouteModified] = useState(false);

  const { result, isLoading, error } = useRoute(start, end, profile, {
    resultOverride,
  });
  const flagSavedUi = useFeatureFlag("saved_routes_ui");
  const savedRoutesUi = flagSavedUi === true;

  const applySavedRoute = useCallback((saved: SavedRoute) => {
    const coords = saved.geometry.coordinates;
    if (coords.length < 2) {
      return;
    }
    const a = coords[0] as [number, number];
    const b = coords[coords.length - 1] as [number, number];
    const s: LatLng = { lat: a[1], lng: a[0] };
    const e: LatLng = { lat: b[1], lng: b[0] };
    setStart(s);
    setEnd(e);
    setProfile({ ...saved.profile });
    setResultOverride(routeResultFromSaved(saved));
    setLoadBaseline({ start: s, end: e, profile: { ...saved.profile } });
    setRouteModified(false);
  }, []);

  useEffect(() => {
    if (!resultOverride || !loadBaseline) {
      return;
    }
    if (!start || !end) {
      return;
    }
    if (
      latLngEqual(start, loadBaseline.start) &&
      latLngEqual(end, loadBaseline.end) &&
      profileEqual(profile, loadBaseline.profile)
    ) {
      return;
    }
    setResultOverride(null);
    setLoadBaseline(null);
    setRouteModified(true);
  }, [start, end, profile, resultOverride, loadBaseline]);

  const handleSave = useCallback(
    async (name: string) => {
      if (!result) {
        throw new Error("No route to save");
      }
      const created = await createRoute({
        name,
        profile,
        geometry: result.geometry,
        distance: Math.round(result.distance),
        duration: Math.round(result.duration),
        ascent: Math.round(result.ascent),
        descent: Math.round(result.descent),
        elevationProfile: result.elevationProfile,
      });
      return created.id;
    },
    [result, profile],
  );

  const handleReset = useCallback(() => {
    setStart(null);
    setEnd(null);
    setResultOverride(null);
    setLoadBaseline(null);
    setRouteModified(false);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: LatLng) => {
      if (!start) {
        setStart(lngLat);
      } else if (!end) {
        setEnd(lngLat);
      } else {
        // Slide forward: old end becomes new start, new click is new end.
        setStart(end);
        setEnd(lngLat);
      }
    },
    [start, end],
  );

  // Escape clears waypoints
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleReset();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleReset]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <RoutaxMap
        start={start}
        end={end}
        routeGeoJSON={result?.geometry ?? null}
        onMapClick={handleMapClick}
        onMapLoaded={() => setMapLoaded(true)}
        mapLoaded={mapLoaded}
      />
      <RoutePanel
        start={start !== null}
        end={end !== null}
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
      />
    </div>
  );
}

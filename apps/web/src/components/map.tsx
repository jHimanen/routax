"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

const FINLAND_CENTER: [number, number] = [25.7482, 61.9241];
const FINLAND_ZOOM = 4.8;

function getStyleUrl(): string | null {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) {
    return null;
  }

  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

export function ViaMap(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleUrl = getStyleUrl();

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !styleUrl) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: FINLAND_CENTER,
      zoom: FINLAND_ZOOM,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: false }));
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

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

"use client";

import {
  PRESET_METADATA,
  type PlanningMetadata,
  type RouteProfilePreset,
  type RouteResult,
  type RoutingProfile,
  type SavedRoute,
  type Waypoint,
} from "@routax/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { downloadPreviewGpx, listRoutes } from "../lib/api";
import { buildRouteUrl } from "../lib/url";
import { ElevationProfile } from "./ElevationProfile";

const PRESET_ORDER: RouteProfilePreset[] = [
  "fastest_direct",
  "quiet_country_roads",
  "maximum_climbing",
  "avoid_gravel",
];

interface RoutePanelProps {
  waypoints: Waypoint[];
  preset: RouteProfilePreset;
  onPresetChange: (p: RouteProfilePreset) => void;
  isCustom: boolean;
  profile: RoutingProfile;
  onProfileChange: (p: RoutingProfile) => void;
  result: RouteResult | null;
  isLoading: boolean;
  error: string | null;
  onReset: () => void;
  /** When false, Save is hidden. */
  savedRoutesUi: boolean;
  onSave: (name: string) => Promise<string>;
  onSelectSaved: (route: SavedRoute) => void;
  /** True while showing a saved route's geometry before any live reroute. */
  savedReadMode: boolean;
  /** True after the user changes profile or waypoints while a save was loadable. */
  routeModified: boolean;
  /** Deep-link rehydration in progress — skeleton panel, no save/load. */
  deepLinkLoading: boolean;
  /** When true, show the Download GPX button. */
  gpxExport: boolean;
  /** When true, render the elevation profile chart. */
  elevationProfileViz: boolean;
  /** Called with the map coordinate under the hovered chart position, or null on leave. */
  onElevationHover: (coord: [number, number] | null) => void;
  onAddVia: () => void;
  onRemoveVia: (id: string) => void;
  onMoveViaUp: (id: string) => void;
  onMoveViaDown: (id: string) => void;
  plannerMode: "point_to_point" | "round_trip";
  onPlannerModeChange: (m: "point_to_point" | "round_trip") => void;
  targetDistanceKm: number;
  onTargetDistanceChange: (v: number) => void;
  directionBias: "any" | "north" | "east" | "south" | "west";
  onDirectionBiasChange: (v: "any" | "north" | "east" | "south" | "west") => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  hasRoundTripStart: boolean;
  planningMetadata: PlanningMetadata | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}min`;
  }
  return `${m}min`;
}

const NAME_MIN = 1;
const NAME_MAX = 80;

function validateRouteName(raw: string): string | null {
  const t = raw.trim();
  if (t.length < NAME_MIN) {
    return "Name is required.";
  }
  if (t.length > NAME_MAX) {
    return `Name must be at most ${NAME_MAX} characters.`;
  }
  return null;
}

type SavePhase = "none" | "form" | "saving" | "saved";

export function RoutePanel({
  waypoints,
  preset,
  onPresetChange,
  isCustom,
  profile,
  onProfileChange,
  result,
  isLoading,
  error,
  onReset,
  savedRoutesUi,
  onSave,
  onSelectSaved,
  savedReadMode,
  routeModified,
  deepLinkLoading,
  gpxExport,
  elevationProfileViz,
  onElevationHover,
  onAddVia,
  onRemoveVia,
  onMoveViaUp,
  onMoveViaDown,
  plannerMode,
  onPlannerModeChange,
  targetDistanceKm,
  onTargetDistanceChange,
  directionBias,
  onDirectionBiasChange,
  onGenerate,
  onRegenerate,
  isGenerating,
  hasRoundTripStart,
  planningMetadata,
}: RoutePanelProps): React.JSX.Element {
  const hasStart = waypoints.length >= 1;
  const hasFinish = waypoints.length >= 2;
  const hint = !hasStart
    ? "Click the map to place start"
    : !hasFinish
      ? "Click the map to place finish"
      : null;
  const nameId = useId();
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [savePhase, setSavePhase] = useState<SavePhase>("none");
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState("");

  const [gpxDownloading, setGpxDownloading] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);

  const [loadOpen, setLoadOpen] = useState(false);
  const [loadItems, setLoadItems] = useState<SavedRoute[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadPending, setLoadPending] = useState(false);
  const loadPanelRef = useRef<HTMLDivElement | null>(null);
  const canUseSaved = savedRoutesUi && !deepLinkLoading;

  useEffect(() => {
    if (!loadOpen || !canUseSaved) return;
    setLoadPending(true);
    setLoadError(null);
    const ac = new AbortController();
    void listRoutes(5, undefined, ac.signal)
      .then((res) => {
        setLoadItems(res.items);
        setLoadPending(false);
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setLoadError(e instanceof Error ? e.message : "Failed to list routes");
        setLoadItems([]);
        setLoadPending(false);
      });
    return () => {
      ac.abort();
    };
  }, [loadOpen, canUseSaved]);

  useEffect(() => {
    if (!loadOpen) return;
    const onDown = (ev: PointerEvent) => {
      if (loadPanelRef.current && !loadPanelRef.current.contains(ev.target as Node)) {
        setLoadOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [loadOpen]);

  const resultSignature = result
    ? JSON.stringify([result.geometry.coordinates, result.distance, profile])
    : null;

  const lastRouteSigRef = useRef<string | null>(null);
  const savePhaseRef = useRef(savePhase);
  savePhaseRef.current = savePhase;

  useEffect(() => {
    if (!result || resultSignature === null) {
      setSavePhase("none");
      setFormName("");
      setFormError(null);
      setSavedUrl("");
      lastRouteSigRef.current = null;
      return;
    }
    if (lastRouteSigRef.current === resultSignature) return;
    if (lastRouteSigRef.current !== null) {
      if (savePhaseRef.current !== "saving") {
        setSavePhase("none");
        setFormName("");
        setFormError(null);
        setSavedUrl("");
      }
    }
    lastRouteSigRef.current = resultSignature;
  }, [resultSignature, result]);

  const startForm = () => {
    if (!result) return;
    setFormName("");
    setFormError(null);
    setSavePhase("form");
  };

  const submitSave = useCallback(async () => {
    const t = formName.trim();
    const nameErr = validateRouteName(formName);
    if (nameErr) {
      setFormError(nameErr);
      return;
    }
    if (!result) return;
    setFormError(null);
    setSavePhase("saving");
    try {
      const id = await onSave(t);
      setSavedUrl(buildRouteUrl(id));
      setSavePhase("saved");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
      setSavePhase("form");
    }
  }, [onSave, formName, result]);

  const copyUrl = async (url: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopyFeedback(true);
        window.setTimeout(() => {
          setCopyFeedback(false);
        }, 2000);
      }
    } catch {
      setCopyFeedback(false);
    }
  };

  const handleGpxDownload = useCallback(async () => {
    if (!result) return;
    setGpxDownloading(true);
    setGpxError(null);
    try {
      await downloadPreviewGpx({
        geometry: result.geometry,
        elevationProfile: result.elevationProfile,
        distance: result.distance,
        name: formName.trim() || undefined,
      });
    } catch (e) {
      setGpxError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setGpxDownloading(false);
    }
  }, [result, formName]);

  const showSaveForm = canUseSaved && result && (savePhase === "form" || savePhase === "saving");
  const showSaved = canUseSaved && savePhase === "saved" && savedUrl;
  const showSaveButton = canUseSaved && result && savePhase === "none" && !showSaved;

  let viaIdx = 0;
  function waypointLabel(w: Waypoint): string {
    if (w.role === "start") return "Start";
    if (w.role === "finish") return "Finish";
    viaIdx++;
    return `Stop ${viaIdx}`;
  }

  const hasGeneratedOnce = plannerMode === "round_trip" && waypoints.length >= 2;

  return (
    <aside className={`route-panel${deepLinkLoading ? " route-panel--deeplink-load" : ""}`}>
      <div className="route-panel-mode-toggle">
        <button
          type="button"
          className={`route-panel-mode-btn${plannerMode === "point_to_point" ? " route-panel-mode-btn--active" : ""}`}
          onClick={() => onPlannerModeChange("point_to_point")}
          disabled={deepLinkLoading}
        >
          Point to point
        </button>
        <button
          type="button"
          className={`route-panel-mode-btn${plannerMode === "round_trip" ? " route-panel-mode-btn--active" : ""}`}
          onClick={() => onPlannerModeChange("round_trip")}
          disabled={deepLinkLoading}
        >
          Round trip
        </button>
      </div>

      {plannerMode === "round_trip" && (
        <div className="route-panel-roundtrip">
          <p className="route-panel-roundtrip-hint">
            {hasRoundTripStart ? "Start placed" : "Click map to place start"}
          </p>
          <label className="route-panel-label" htmlFor="rt-distance">
            Target distance (km)
          </label>
          <input
            id="rt-distance"
            type="number"
            min={5}
            max={500}
            step={5}
            value={targetDistanceKm}
            onChange={(e) => onTargetDistanceChange(Number(e.target.value))}
            disabled={isGenerating}
            className="route-panel-rt-input"
          />
          <label className="route-panel-label" htmlFor="rt-bias">
            Direction bias
          </label>
          <select
            id="rt-bias"
            value={directionBias}
            onChange={(e) =>
              onDirectionBiasChange(e.target.value as "any" | "north" | "east" | "south" | "west")
            }
            disabled={isGenerating}
            className="route-panel-rt-select"
          >
            <option value="any">Any</option>
            <option value="north">North</option>
            <option value="east">East</option>
            <option value="south">South</option>
            <option value="west">West</option>
          </select>
          <div className="route-panel-rt-actions">
            <button
              type="button"
              className="route-panel-rt-generate"
              onClick={onGenerate}
              disabled={!hasRoundTripStart || isGenerating}
            >
              {isGenerating ? "Generating…" : "Generate loop"}
            </button>
            {hasGeneratedOnce && (
              <button
                type="button"
                className="route-panel-rt-regenerate"
                onClick={onRegenerate}
                disabled={isGenerating}
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      )}

      {deepLinkLoading && (
        <p className="route-panel-deeplink-status" aria-live="polite">
          Loading route…
        </p>
      )}

      {canUseSaved && (
        <div className="route-panel-header" ref={loadPanelRef}>
          <button
            type="button"
            className="route-panel-load-trigger"
            onClick={() => {
              setLoadOpen((o) => !o);
            }}
            aria-expanded={loadOpen}
            aria-haspopup="listbox"
          >
            Load
          </button>
          {loadOpen && (
            <div className="route-panel-load-popover" aria-label="Recent saved routes">
              {loadPending && <p className="route-panel-load-status">Loading…</p>}
              {loadError && (
                <p className="route-panel-load-error" role="alert">
                  {loadError}
                </p>
              )}
              {!loadPending && !loadError && loadItems.length === 0 && (
                <p className="route-panel-load-empty">No saved routes yet</p>
              )}
              {loadItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="route-panel-load-row"
                  onClick={() => {
                    onSelectSaved(item);
                    setLoadOpen(false);
                  }}
                >
                  <span className="route-panel-load-name">{item.name}</span>
                  <span className="route-panel-load-meta">
                    {(item.distance / 1000).toFixed(1)} km ·{" "}
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {savedReadMode && !routeModified && (
        <p className="route-panel-saved-hint">
          Saved route — change preset or adjust sliders to reroute
        </p>
      )}
      {routeModified && <p className="route-panel-modified">Modified</p>}

      {/* Waypoint list */}
      {waypoints.length > 0 && (
        <ul className="route-panel-waypoints">
          {(() => {
            viaIdx = 0;
            return waypoints.map((w, idx) => (
              <li key={w.id} className={`route-panel-waypoint route-panel-waypoint--${w.role}`}>
                <span className="route-panel-waypoint-label">{waypointLabel(w)}</span>
                <span className="route-panel-waypoint-coords">
                  {w.position.lat.toFixed(4)}, {w.position.lng.toFixed(4)}
                </span>
                {w.role === "via" && (
                  <span className="route-panel-waypoint-actions">
                    <button
                      type="button"
                      className="route-panel-waypoint-btn"
                      onClick={() => onMoveViaUp(w.id)}
                      disabled={idx <= 1}
                      aria-label="Move stop up"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="route-panel-waypoint-btn"
                      onClick={() => onMoveViaDown(w.id)}
                      disabled={idx >= waypoints.length - 2}
                      aria-label="Move stop down"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="route-panel-waypoint-btn route-panel-waypoint-btn--remove"
                      onClick={() => onRemoveVia(w.id)}
                      aria-label="Remove stop"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </li>
            ));
          })()}
        </ul>
      )}

      {/* Add stop button — visible in point-to-point mode once both endpoints are placed */}
      {plannerMode === "point_to_point" && hasFinish && (
        <button
          type="button"
          className="route-panel-add-via"
          onClick={onAddVia}
          disabled={deepLinkLoading}
        >
          + Add stop
        </button>
      )}

      <div className="route-panel-presets">
        {PRESET_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            className={`route-panel-preset${preset === p ? " route-panel-preset--active" : ""}`}
            disabled={deepLinkLoading}
            onClick={() => onPresetChange(p)}
            title={PRESET_METADATA[p].description}
          >
            {PRESET_METADATA[p].label}
          </button>
        ))}
        {isCustom && <span className="route-panel-preset-custom">Customised</span>}
      </div>

      <details className="route-panel-advanced">
        <summary className="route-panel-advanced-summary">Advanced</summary>
        <div className="route-panel-sliders">
          <label className="route-panel-label">
            <span>Avoid traffic</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={profile.avoidTraffic}
              disabled={deepLinkLoading}
              onChange={(e) =>
                onProfileChange({ ...profile, avoidTraffic: Number(e.target.value) })
              }
            />
          </label>
          <label className="route-panel-label">
            <span>Prefer quiet surfaces</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={profile.preferQuietSurfaces}
              disabled={deepLinkLoading}
              onChange={(e) =>
                onProfileChange({ ...profile, preferQuietSurfaces: Number(e.target.value) })
              }
            />
          </label>
          <label className="route-panel-label">
            <span>Max gradient ({profile.maxGradient}%)</span>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={profile.maxGradient}
              disabled={deepLinkLoading}
              onChange={(e) => onProfileChange({ ...profile, maxGradient: Number(e.target.value) })}
            />
          </label>
        </div>
      </details>

      {plannerMode === "point_to_point" && hint && <p className="route-panel-hint">{hint}</p>}

      {result && planningMetadata?.mode === "round_trip" && (
        <p className="route-panel-rt-pill">
          Generated as ~{planningMetadata.targetDistanceKm} km loop
        </p>
      )}

      {result && (
        <div className="route-panel-result">
          <span>{(result.distance / 1000).toFixed(1)} km</span>
          <span>{formatDuration(result.duration)}</span>
          {result.ascent !== undefined && <span>↑ {result.ascent.toFixed(0)} m</span>}
          {result.descent !== undefined && <span>↓ {result.descent.toFixed(0)} m</span>}
        </div>
      )}

      {elevationProfileViz && result && result.elevationProfile.length >= 2 && (
        <ElevationProfile
          elevationProfile={result.elevationProfile}
          geometry={result.geometry}
          onHoverCoord={onElevationHover}
        />
      )}

      {gpxExport && result && (
        <button
          type="button"
          className="route-panel-gpx"
          onClick={() => {
            void handleGpxDownload();
          }}
          disabled={gpxDownloading || isLoading}
        >
          {gpxDownloading ? "Downloading…" : "Download GPX"}
        </button>
      )}
      {gpxError && (
        <p className="route-panel-error" role="alert">
          {gpxError}
        </p>
      )}

      {isLoading && <p className="route-panel-status">Routing…</p>}

      {error && (
        <p className="route-panel-error" role="alert">
          {error}
        </p>
      )}

      {showSaveButton && (
        <button type="button" className="route-panel-save" onClick={startForm} disabled={isLoading}>
          Save route
        </button>
      )}

      {showSaveForm && (
        <fieldset className="route-panel-form">
          <legend className="route-panel-form-legend">Name your route</legend>
          <label htmlFor={nameId} className="route-panel-form-label">
            Name
            <input
              id={nameId}
              type="text"
              className="route-panel-form-input"
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value);
                setFormError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && formName.trim() !== "" && savePhase === "form") {
                  void submitSave();
                }
              }}
              maxLength={NAME_MAX}
              disabled={savePhase === "saving" || isLoading}
              required
            />
          </label>
          {formError && (
            <p className="route-panel-form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="route-panel-form-actions">
            <button
              type="button"
              className="route-panel-form-submit"
              onClick={() => {
                void submitSave();
              }}
              disabled={savePhase === "saving" || isLoading}
            >
              {savePhase === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="route-panel-form-cancel"
              onClick={() => {
                if (savePhase !== "saving") {
                  setSavePhase("none");
                  setFormName("");
                  setFormError(null);
                }
              }}
              disabled={savePhase === "saving"}
            >
              Cancel
            </button>
          </div>
        </fieldset>
      )}

      {showSaved && (
        <div className="route-panel-saved">
          <p className="route-panel-saved-title">Saved</p>
          <button
            type="button"
            className="route-panel-saved-url"
            onClick={() => {
              void copyUrl(savedUrl);
            }}
            title="Click to copy"
          >
            {savedUrl}
          </button>
          {copyFeedback && <span className="route-panel-saved-copy">Copied to clipboard</span>}
          <button
            type="button"
            className="route-panel-saved-dismiss"
            onClick={() => {
              setSavePhase("none");
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {hasStart && (
        <button type="button" className="route-panel-reset" onClick={onReset}>
          Reset
        </button>
      )}
    </aside>
  );
}

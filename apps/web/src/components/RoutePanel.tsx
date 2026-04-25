"use client";

import type { RouteResult, RoutingProfile } from "@routax/shared";

interface RoutePanelProps {
  start: boolean;
  end: boolean;
  profile: RoutingProfile;
  onProfileChange: (p: RoutingProfile) => void;
  result: RouteResult | null;
  isLoading: boolean;
  error: string | null;
  onReset: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function RoutePanel({
  start,
  end,
  profile,
  onProfileChange,
  result,
  isLoading,
  error,
  onReset,
}: RoutePanelProps): React.JSX.Element {
  const hint = !start ? "Click the map to place start" : !end ? "Click the map to place end" : null;

  return (
    <aside className="route-panel">
      <div className="route-panel-sliders">
        <label className="route-panel-label">
          <span>Avoid traffic</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={profile.avoidTraffic}
            onChange={(e) => onProfileChange({ ...profile, avoidTraffic: Number(e.target.value) })}
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
            onChange={(e) => onProfileChange({ ...profile, maxGradient: Number(e.target.value) })}
          />
        </label>
      </div>

      {hint && <p className="route-panel-hint">{hint}</p>}

      {result && (
        <div className="route-panel-result">
          <span>{(result.distance / 1000).toFixed(1)} km</span>
          <span>{formatDuration(result.duration)}</span>
          {result.ascent !== undefined && <span>↑ {result.ascent.toFixed(0)} m</span>}
        </div>
      )}

      {isLoading && <p className="route-panel-status">Routing…</p>}

      {error && (
        <p className="route-panel-error" role="alert">
          {error}
        </p>
      )}

      {start && (
        <button type="button" className="route-panel-reset" onClick={onReset}>
          Reset
        </button>
      )}
    </aside>
  );
}

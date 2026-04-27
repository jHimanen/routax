"use client";

import type { RouteResult, RoutingProfile } from "@routax/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";

interface RoutePanelProps {
  start: boolean;
  end: boolean;
  profile: RoutingProfile;
  onProfileChange: (p: RoutingProfile) => void;
  result: RouteResult | null;
  isLoading: boolean;
  error: string | null;
  onReset: () => void;
  /** When false, Save is hidden. */
  savedRoutesUi: boolean;
  onSave: (name: string) => Promise<string>;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}min`;
  }
  return `${m}min`;
}

function getCanonicalAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

function buildRouteUrl(routeId: string): string {
  return `${getCanonicalAppOrigin()}/?route=${encodeURIComponent(routeId)}`;
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
  start,
  end,
  profile,
  onProfileChange,
  result,
  isLoading,
  error,
  onReset,
  savedRoutesUi,
  onSave,
}: RoutePanelProps): React.JSX.Element {
  const hint = !start ? "Click the map to place start" : !end ? "Click the map to place end" : null;
  const nameId = useId();
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [savePhase, setSavePhase] = useState<SavePhase>("none");
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState("");

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
    if (lastRouteSigRef.current === resultSignature) {
      return;
    }
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
    if (!result) {
      return;
    }
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
    if (!result) {
      return;
    }
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

  const showSaveForm = savedRoutesUi && result && (savePhase === "form" || savePhase === "saving");
  const showSaved = savedRoutesUi && savePhase === "saved" && savedUrl;
  const showSaveButton = savedRoutesUi && result && savePhase === "none" && !showSaved;

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

      {start && (
        <button type="button" className="route-panel-reset" onClick={onReset}>
          Reset
        </button>
      )}
    </aside>
  );
}

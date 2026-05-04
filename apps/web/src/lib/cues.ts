import type { CueEntry } from "@routax/shared";

const MANEUVER_LABELS: Record<string, string> = {
  turn_left: "Turn left",
  slight_left: "Bear left",
  sharp_left: "Sharp left",
  turn_right: "Turn right",
  slight_right: "Bear right",
  sharp_right: "Sharp right",
  continue: "Continue",
  roundabout_right: "Roundabout",
  roundabout_left: "Roundabout",
  keep_right: "Keep right",
  keep_left: "Keep left",
  via_point: "Via point",
  finish: "Finish",
};

export function maneuverLabel(maneuver: string): string {
  return MANEUVER_LABELS[maneuver] ?? "Continue";
}

/** Format a distance in metres for display. Under 1 km → "Xm", at or over → "X.Xkm". */
export function formatCueDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Short label for a cue row: maneuver abbreviation + street name (if present). */
export function cueRowLabel(cue: CueEntry): string {
  const label = maneuverLabel(cue.maneuver);
  return cue.streetName ? `${label} · ${cue.streetName}` : label;
}

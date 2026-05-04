import type { CueEntry } from "@routax/shared";

export interface GpxParams {
  name: string;
  createdAt: string;
  appLink?: string;
  coordinates: [number, number][];
  elevationProfile: number[];
  cueSheet?: CueEntry[];
}

const GPXX_NS = "http://www.garmin.com/xmlschemas/GpxExtensions/v3";
const GPXX_XSD = "http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd";
const MAX_WPT_NAME = 30;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cueLabel(cue: CueEntry): string {
  const maneuverAbbrev: Record<string, string> = {
    turn_left: "L",
    slight_left: "SL",
    sharp_left: "ShL",
    turn_right: "R",
    slight_right: "SR",
    sharp_right: "ShR",
    continue: "C",
    roundabout_right: "RA",
    roundabout_left: "RA",
    keep_right: "KR",
    keep_left: "KL",
    via_point: "Via",
    finish: "Finish",
  };
  const abbrev = maneuverAbbrev[cue.maneuver] ?? cue.maneuver;
  const label = cue.streetName ? `${abbrev} ${cue.streetName}` : cue.text;
  return label.slice(0, MAX_WPT_NAME);
}

export function toSlug(text: string): string {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return normalized || "route";
}

export function buildGpx({
  name,
  createdAt,
  appLink,
  coordinates,
  elevationProfile,
  cueSheet = [],
}: GpxParams): string {
  const trkpts = coordinates
    .map(([lng, lat], i) => {
      const ele = (elevationProfile[i] ?? 0).toFixed(1);
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${ele}</ele></trkpt>`;
    })
    .join("\n");

  const linkXml = appLink ? `\n    <link href="${appLink}"><text>Routax</text></link>` : "";

  // Emit waypoints for every cue except the final "finish" entry.
  const wptCues = cueSheet.filter((c) => c.maneuver !== "finish");
  const wptsXml = wptCues
    .map((cue) => {
      const lng = cue.coordinate[0];
      const lat = cue.coordinate[1];
      const label = escapeXml(cueLabel(cue));
      return `  <wpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">
    <name>${label}</name>
    <extensions>
      <gpxx:WaypointExtension xmlns:gpxx="${GPXX_NS}">
        <gpxx:DisplayMode>SymbolAndName</gpxx:DisplayMode>
      </gpxx:WaypointExtension>
    </extensions>
  </wpt>`;
    })
    .join("\n");

  const hasWpts = wptsXml.length > 0;
  const gpxxNsDecl = hasWpts
    ? `\n     xmlns:gpxx="${GPXX_NS}"\n     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd ${GPXX_NS} ${GPXX_XSD}"`
    : `\n     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Routax"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${gpxxNsDecl}>
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${createdAt}</time>${linkXml}
  </metadata>
${hasWpts ? `${wptsXml}\n` : ""}  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

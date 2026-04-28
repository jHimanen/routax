export interface GpxParams {
  name: string;
  createdAt: string;
  appLink?: string;
  coordinates: [number, number][];
  elevationProfile: number[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
}: GpxParams): string {
  const trkpts = coordinates
    .map(([lng, lat], i) => {
      const ele = (elevationProfile[i] ?? 0).toFixed(1);
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${ele}</ele></trkpt>`;
    })
    .join("\n");

  const linkXml = appLink ? `\n    <link href="${appLink}"><text>Routax</text></link>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Routax"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${createdAt}</time>${linkXml}
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

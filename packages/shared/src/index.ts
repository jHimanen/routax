/** Geographic coordinate pair. Used by both web and API. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A named waypoint on a route. */
export interface Waypoint {
  id: string;
  position: LatLng;
  label?: string;
}

/** Cyclist-controlled routing profile parameters (all values 0–1 unless noted). */
export interface RoutingProfile {
  /** Prefer routes away from high-traffic roads. 0 = ignore, 1 = strongly avoid. */
  avoidTraffic: number;
  /** Prefer unpaved / quiet surfaces over fast tarmac. 0 = ignore, 1 = strongly prefer. */
  preferQuietSurfaces: number;
  /** Maximum acceptable gradient in percent (0–20). */
  maxGradient: number;
}

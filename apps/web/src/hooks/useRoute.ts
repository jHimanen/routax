import type { RouteResult, RoutingProfile, Waypoint } from "@routax/shared";
import { useEffect, useRef, useState } from "react";
import { postRoute } from "../lib/api";

export interface UseRouteResult {
  result: RouteResult | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseRouteOptions {
  /** When set, this result is returned and the `/api/route` debounced fetch is disabled. */
  resultOverride: RouteResult | null;
}

export function useRoute(
  waypoints: Waypoint[],
  profile: RoutingProfile,
  options: UseRouteOptions = { resultOverride: null },
): UseRouteResult {
  const { resultOverride } = options;
  const [fetched, setFetched] = useState<RouteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (resultOverride) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      setError(null);
      setIsLoading(false);
      return;
    }

    if (waypoints.length < 2) {
      setFetched(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const data = await postRoute(
          {
            mode: "point_to_point",
            waypoints: waypoints.map((w) => w.position),
            profile,
          },
          controller.signal,
        );
        setFetched(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Routing failed");
        setFetched(null);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [waypoints, profile, resultOverride]);

  const result = resultOverride ?? fetched;
  if (resultOverride) {
    return { result, isLoading: false, error: null };
  }
  return { result, isLoading, error };
}

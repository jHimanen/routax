import type { LatLng, RouteResult, RoutingProfile } from "@via/shared";
import { useEffect, useRef, useState } from "react";
import { postRoute } from "../lib/api";

interface UseRouteResult {
  result: RouteResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useRoute(
  start: LatLng | null,
  end: LatLng | null,
  profile: RoutingProfile,
): UseRouteResult {
  const [result, setResult] = useState<RouteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!start || !end) {
      setResult(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Clear any pending debounce
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const data = await postRoute({ start, end, profile }, controller.signal);
        setResult(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Routing failed");
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, profile]);

  return { result, isLoading, error };
}

import { useEffect, useState } from "react";
import { fetchFlags } from "../lib/flags";

export function useFeatureFlags(): {
  flags: Record<string, boolean>;
  isReady: boolean;
} {
  const [state, setState] = useState<{
    flags: Record<string, boolean>;
    isReady: boolean;
  }>({ flags: {}, isReady: false });

  useEffect(() => {
    const controller = new AbortController();
    void fetchFlags(controller.signal)
      .then((f) => {
        setState({ flags: f, isReady: true });
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        // Surface empty flags; callers treat missing keys as off.
        setState({ flags: {}, isReady: true });
      });
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}

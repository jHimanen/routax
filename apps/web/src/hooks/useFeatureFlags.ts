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
    let mounted = true;
    // fetchFlags caches the promise module-level. Passing an AbortSignal bakes
    // it into the shared promise: React 18 Strict Mode aborts the first mount
    // synchronously before the remount runs, so the remount gets the same
    // aborted promise, the AbortError is swallowed, and isReady never flips.
    // Guard setState with a mounted flag instead.
    void fetchFlags()
      .then((f) => {
        if (mounted) setState({ flags: f, isReady: true });
      })
      .catch(() => {
        if (mounted) setState({ flags: {}, isReady: true });
      });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

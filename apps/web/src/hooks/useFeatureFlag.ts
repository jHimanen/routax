import { useFeatureFlags } from "./useFeatureFlags";

/**
 * @returns `undefined` while flags are loading, then the evaluated boolean.
 */
export function useFeatureFlag(key: string): boolean | undefined {
  const { flags, isReady } = useFeatureFlags();
  if (!isReady) {
    return undefined;
  }
  return flags[key] ?? false;
}

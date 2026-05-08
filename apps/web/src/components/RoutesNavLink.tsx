"use client";

import { useFeatureFlags } from "../hooks/useFeatureFlags";

export function RoutesNavLink() {
  const { flags, isReady } = useFeatureFlags();
  if (!isReady || !flags.saved_routes_ui) return null;
  return (
    <a href="/routes" className="app-header-routes-link">
      My routes
    </a>
  );
}

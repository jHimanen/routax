import type { RouteProfilePreset, RouteResult, RoutingProfile, Waypoint } from "@routax/shared";
import { useCallback, useRef, useState } from "react";

export type PlannerMode = "point_to_point" | "round_trip";
export type DirectionBias = "any" | "north" | "east" | "south" | "west";

export type PlannerSnapshot = {
  waypoints: Waypoint[];
  preset: RouteProfilePreset;
  profile: RoutingProfile;
  plannerMode: PlannerMode;
  targetDistanceKm: number;
  directionBias: DirectionBias;
  roundTripSeed: number;
  resultOverride: RouteResult | null;
};

type UsePlannerHistory = {
  push: (snapshot: PlannerSnapshot) => void;
  undo: () => PlannerSnapshot | null;
  redo: () => PlannerSnapshot | null;
  reset: (snapshot: PlannerSnapshot) => void;
  canUndo: boolean;
  canRedo: boolean;
};

const MAX_HISTORY = 50;

export function usePlannerHistory(): UsePlannerHistory {
  const past = useRef<PlannerSnapshot[]>([]);
  const future = useRef<PlannerSnapshot[]>([]);
  // Bumped after every mutation so canUndo/canRedo re-derive from ref lengths.
  const [, setCount] = useState(0);

  const push = useCallback((snapshot: PlannerSnapshot) => {
    const entry = structuredClone(snapshot);
    past.current = [...past.current.slice(-(MAX_HISTORY - 1)), entry];
    future.current = [];
    setCount((c) => c + 1);
  }, []);

  const undo = useCallback((): PlannerSnapshot | null => {
    if (past.current.length <= 1) return null;
    const top = past.current.at(-1);
    if (top === undefined) return null;
    future.current = [top, ...future.current];
    past.current = past.current.slice(0, -1);
    setCount((c) => c + 1);
    return past.current.at(-1) ?? null;
  }, []);

  const redo = useCallback((): PlannerSnapshot | null => {
    const [next, ...rest] = future.current;
    if (next === undefined) return null;
    future.current = rest;
    past.current = [...past.current, next];
    setCount((c) => c + 1);
    return next;
  }, []);

  const reset = useCallback((snapshot: PlannerSnapshot) => {
    past.current = [structuredClone(snapshot)];
    future.current = [];
    setCount((c) => c + 1);
  }, []);

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 1,
    canRedo: future.current.length > 0,
  };
}

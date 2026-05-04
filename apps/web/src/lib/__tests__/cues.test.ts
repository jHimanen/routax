import type { CueEntry } from "@routax/shared";
import { describe, expect, it } from "vitest";
import { cueRowLabel, formatCueDistance, maneuverLabel } from "../cues";

describe("formatCueDistance", () => {
  it("formats sub-kilometre distances in metres", () => {
    expect(formatCueDistance(0)).toBe("0m");
    expect(formatCueDistance(250)).toBe("250m");
    expect(formatCueDistance(999)).toBe("999m");
  });

  it("formats kilometre-range distances to one decimal", () => {
    expect(formatCueDistance(1000)).toBe("1.0km");
    expect(formatCueDistance(1500)).toBe("1.5km");
    expect(formatCueDistance(12345)).toBe("12.3km");
  });
});

describe("maneuverLabel", () => {
  it("returns human-readable labels for known maneuvers", () => {
    expect(maneuverLabel("turn_left")).toBe("Turn left");
    expect(maneuverLabel("turn_right")).toBe("Turn right");
    expect(maneuverLabel("continue")).toBe("Continue");
    expect(maneuverLabel("finish")).toBe("Finish");
    expect(maneuverLabel("roundabout_right")).toBe("Roundabout");
  });

  it("falls back to Continue for unknown maneuvers", () => {
    expect(maneuverLabel("unknown_future_value")).toBe("Continue");
  });
});

describe("cueRowLabel", () => {
  const baseCue: CueEntry = {
    index: 0,
    distanceFromStartMeters: 0,
    distanceFromPreviousMeters: 0,
    maneuver: "turn_right",
    text: "Turn right onto Mannerheimintie",
    coordinate: [24.93, 60.17],
  };

  it("includes street name when present", () => {
    const label = cueRowLabel({ ...baseCue, streetName: "Mannerheimintie" });
    expect(label).toBe("Turn right · Mannerheimintie");
  });

  it("omits separator when street name is absent", () => {
    const label = cueRowLabel(baseCue);
    expect(label).toBe("Turn right");
  });
});

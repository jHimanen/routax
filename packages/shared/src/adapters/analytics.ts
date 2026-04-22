import type { AnalyticsEvent } from "../types/analytics";
import type { UserId } from "../types/user";

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): Promise<void>;
  identify(userId: UserId, traits: Record<string, unknown>): Promise<void>;
}

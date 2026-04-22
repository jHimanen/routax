export interface AnalyticsEvent {
  name: string;
  userId?: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
}

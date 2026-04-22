export type SubscriptionTier = "free" | "pro";

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  validUntil?: Date;
}

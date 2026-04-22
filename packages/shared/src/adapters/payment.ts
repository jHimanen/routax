import type { SubscriptionStatus, SubscriptionTier } from "../types/payment";
import type { UserId } from "../types/user";

export interface PaymentProvider {
  getSubscriptionStatus(userId: UserId): Promise<SubscriptionStatus>;
  createCheckoutSession(userId: UserId, plan: SubscriptionTier): Promise<{ url: string }>;
  handleWebhook(rawBody: Buffer, signature: string): Promise<void>;
}

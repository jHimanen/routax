import type { PaymentProvider, SubscriptionStatus, UserId } from "@routax/shared";

export class NoopPaymentProvider implements PaymentProvider {
  async getSubscriptionStatus(_userId: UserId): Promise<SubscriptionStatus> {
    return { tier: "free" };
  }

  async createCheckoutSession(_userId: UserId, _plan: "free" | "pro"): Promise<{ url: string }> {
    // TODO Phase 6: replace with Stripe checkout session
    throw new Error("NotImplementedError: createCheckoutSession is unavailable in local mode");
  }

  async handleWebhook(_rawBody: Buffer, _signature: string): Promise<void> {
    // TODO Phase 6: replace with Stripe webhook handling
  }
}

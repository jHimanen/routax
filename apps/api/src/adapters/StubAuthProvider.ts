import type { AuthProvider } from "@via/shared";
import type { UserContext, UserId } from "@via/shared";

export class StubAuthProvider implements AuthProvider {
  async getUserContext(_request: unknown): Promise<UserContext | null> {
    return {
      id: (process.env.STUB_AUTH_USER_ID ?? "stub-user-1") as UserId,
      email: process.env.STUB_AUTH_EMAIL ?? "stub@via.local",
    };
  }

  async requireUser(request: unknown): Promise<UserContext> {
    const ctx = await this.getUserContext(request);
    // Stub always returns a user — null path does not exist in Phase 1
    return ctx as UserContext;
  }
}

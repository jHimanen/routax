import type { UserContext } from "../types/user";

export interface AuthProvider {
  getUserContext(request: unknown): Promise<UserContext | null>;
  requireUser(request: unknown): Promise<UserContext>;
}

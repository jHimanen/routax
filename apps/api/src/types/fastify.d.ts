import type { UserContext } from "@via/shared";

declare module "fastify" {
  interface FastifyRequest {
    userContext: UserContext | null;
  }
}

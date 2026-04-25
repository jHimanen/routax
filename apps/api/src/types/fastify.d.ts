import type { UserContext } from "@routax/shared";

declare module "fastify" {
  interface FastifyRequest {
    userContext: UserContext | null;
  }
}

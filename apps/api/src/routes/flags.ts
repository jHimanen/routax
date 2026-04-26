import type { FastifyInstance } from "fastify";
import type { FlagContext } from "@routax/shared";
import type { Container } from "../container.js";

export function registerFlagsRoute(app: FastifyInstance, container: Container): void {
  app.get("/flags", async (request) => {
    const ctx: FlagContext = {
      userId: request.userContext?.id,
      environment: (process.env.NODE_ENV ?? "local") as FlagContext["environment"],
    };
    return container.flags.evaluateAll(ctx);
  });
}

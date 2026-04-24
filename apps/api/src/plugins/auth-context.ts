import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

export function setupAuthContext(app: FastifyInstance, container: Container): void {
  app.decorateRequest("userContext", null);
  app.addHook("onRequest", async (request) => {
    request.userContext = await container.auth.getUserContext(request);
  });
}

import type { FastifyError, FastifyInstance } from "fastify";

export function setupErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: "REQUEST_ERROR", message: error.message } });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
}

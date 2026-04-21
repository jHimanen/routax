import type { RoutingProfile } from "@via/shared";
import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/health", async (_request, _reply) => {
  return { status: "ok" };
});

// Placeholder — real routing implementation in Task 05
fastify.get("/route", async (_request, _reply): Promise<{ profile: RoutingProfile }> => {
  return {
    profile: {
      avoidTraffic: 0.5,
      preferQuietSurfaces: 0.5,
      maxGradient: 10,
    },
  };
});

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.API_PORT ?? 3001);
    await fastify.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

void start();

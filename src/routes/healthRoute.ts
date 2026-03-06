import { FastifyInstance } from "fastify";

export const registerHealthRoute = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/health", async () => {
    return {
      data: {
        service: "edgemarkets-be",
        status: "ok",
        timestamp: new Date().toISOString()
      },
      error: null
    };
  });
};

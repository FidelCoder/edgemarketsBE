import { FastifyInstance } from "fastify";
import { getRuntimeConfig } from "../services/runtimeService.js";

export const registerRuntimeRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/runtime/config", async () => {
    return {
      data: await getRuntimeConfig(),
      error: null
    };
  });
};

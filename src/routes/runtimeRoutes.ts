import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { simulateFollowSchema } from "../domain/validators.js";
import { getRuntimeConfig, simulateFollow } from "../services/runtimeService.js";

export const registerRuntimeRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/runtime/config", async () => {
    return {
      data: await getRuntimeConfig(),
      error: null
    };
  });

  app.post("/api/runtime/simulate-follow", async (request) => {
    const parsed = simulateFollowSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? "Invalid simulation payload.", 400);
    }

    return {
      data: await simulateFollow(parsed.data),
      error: null
    };
  });
};

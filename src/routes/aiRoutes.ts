import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { generateMarketInsightSchema } from "../domain/validators.js";
import { generateMarketInsight } from "../services/marketInsightService.js";

export const registerAiRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post("/api/ai/market-insight", async (request) => {
    const parsedBody = generateMarketInsightSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid market insight payload.", 400);
    }

    return {
      data: await generateMarketInsight(parsedBody.data),
      error: null
    };
  });
};

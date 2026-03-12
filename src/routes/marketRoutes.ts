import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { marketParamsSchema } from "../domain/validators.js";
import { getStore } from "../repositories/storeProvider.js";
import { getMarketContext } from "../services/marketContextService.js";
import { listMarkets } from "../services/polymarketService.js";

export const registerMarketRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/markets", async () => {
    return {
      data: await listMarkets(),
      error: null
    };
  });

  app.get("/api/markets/:marketId/context", async (request) => {
    const parsedParams = marketParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError(parsedParams.error.errors[0]?.message ?? "Invalid market params.", 400);
    }

    return {
      data: await getMarketContext(parsedParams.data.marketId),
      error: null
    };
  });

  app.get("/api/stablecoins", async () => {
    const store = getStore();

    return {
      data: await store.listStablecoins(),
      error: null
    };
  });
};

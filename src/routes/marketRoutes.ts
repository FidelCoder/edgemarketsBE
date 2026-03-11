import { FastifyInstance } from "fastify";
import { getStore } from "../repositories/storeProvider.js";
import { listMarkets } from "../services/polymarketService.js";

export const registerMarketRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/markets", async () => {
    return {
      data: await listMarkets(),
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

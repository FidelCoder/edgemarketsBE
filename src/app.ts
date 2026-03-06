import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";
import { isAllowedOrigin } from "./config/cors.js";
import { closeStore, initializeStore } from "./repositories/storeProvider.js";
import { registerHealthRoute } from "./routes/healthRoute.js";
import { registerMarketRoutes } from "./routes/marketRoutes.js";
import { registerRuntimeRoutes } from "./routes/runtimeRoutes.js";
import { registerStrategyRoutes } from "./routes/strategyRoutes.js";

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true
  });

  await initializeStore(app.log);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by EdgeMarkets API policy."), false);
    },
    credentials: false
  });

  await registerHealthRoute(app);
  await registerMarketRoutes(app);
  await registerRuntimeRoutes(app);
  await registerStrategyRoutes(app);

  app.addHook("onClose", async () => {
    await closeStore();
  });

  return app;
};

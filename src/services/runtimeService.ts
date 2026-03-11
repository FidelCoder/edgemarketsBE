import { env } from "../config/env.js";
import { RuntimeConfig } from "../domain/types.js";
import { getActiveStoreProvider, getStore } from "../repositories/storeProvider.js";

export const getRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const store = getStore();
  const stablecoins = await store.listStablecoins();

  return {
    networkMode: env.networkMode,
    polygonNetwork: env.polygonNetwork,
    polymarketEnvironment: env.polymarketEnvironment,
    polymarketHost: env.polymarketHost,
    polymarketGammaHost: env.polymarketGammaHost,
    polymarketChainId: env.polymarketChainId,
    polymarketMarketSource: env.polymarketMarketSource,
    executionMode: env.executionMode,
    storeProvider: getActiveStoreProvider(),
    triggerWorkerEnabled: env.triggerWorkerEnabled,
    triggerWorkerIntervalMs: env.triggerWorkerIntervalMs,
    triggerWorkerBatchSize: env.triggerWorkerBatchSize,
    supportedStablecoins: stablecoins.map((asset) => asset.symbol)
  };
};

import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  RuntimeConfig,
  SimulateFollowInput,
  SimulateFollowResult,
  StablecoinSymbol
} from "../domain/types.js";
import { getActiveStoreProvider, getStore } from "../repositories/storeProvider.js";

const feeBpsByStablecoin: Record<StablecoinSymbol, number> = {
  USDC: 10,
  USDT: 22,
  DAI: 24
};

export const getRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const store = getStore();
  const stablecoins = await store.listStablecoins();

  return {
    networkMode: env.networkMode,
    polygonNetwork: env.polygonNetwork,
    polymarketEnvironment: env.polymarketEnvironment,
    executionMode: env.executionMode,
    storeProvider: getActiveStoreProvider(),
    triggerWorkerEnabled: env.triggerWorkerEnabled,
    triggerWorkerIntervalMs: env.triggerWorkerIntervalMs,
    triggerWorkerBatchSize: env.triggerWorkerBatchSize,
    supportedStablecoins: stablecoins.map((asset) => asset.symbol)
  };
};

export const simulateFollow = async (input: SimulateFollowInput): Promise<SimulateFollowResult> => {
  const store = getStore();
  const strategy = await store.getStrategyById(input.strategyId);

  if (!strategy) {
    throw new AppError("Strategy not found for simulation.", 404);
  }

  const stablecoin = (await store.listStablecoins()).find(
    (asset) => asset.symbol === input.fundingStablecoin
  );

  if (!stablecoin) {
    throw new AppError("Stablecoin not supported.", 400);
  }

  const feeBps = feeBpsByStablecoin[input.fundingStablecoin];
  const estimatedFeesUsd = Number(((input.allocationUsd * feeBps) / 10000).toFixed(2));
  const estimatedSettlementUsd = Number((input.allocationUsd - estimatedFeesUsd).toFixed(2));

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    allocationUsd: input.allocationUsd,
    fundingStablecoin: input.fundingStablecoin,
    settlementAsset: "USDC",
    conversionRequired: stablecoin.conversionRequired,
    estimatedFeesUsd,
    estimatedSettlementUsd,
    networkMode: env.networkMode,
    executionMode: env.executionMode
  };
};

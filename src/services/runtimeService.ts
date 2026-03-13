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
    agentWorkerEnabled: env.agentWorkerEnabled,
    agentWorkerIntervalMs: env.agentWorkerIntervalMs,
    agentWorkerBatchSize: env.agentWorkerBatchSize,
    supportedStablecoins: stablecoins.map((asset) => asset.symbol),
    aiEnabled: Boolean(env.openAiApiKey || env.anthropicApiKey),
    aiDefaultProvider: env.aiDefaultProvider,
    aiModel:
      env.aiDefaultProvider === "anthropic"
        ? env.anthropicApiKey
          ? env.anthropicModel
          : null
        : env.openAiApiKey
          ? env.openAiModel
          : null,
    aiWebSearchEnabled:
      env.aiDefaultProvider === "anthropic" ? env.anthropicWebSearchEnabled : env.openAiWebSearchEnabled,
    aiProviders: [
      {
        id: "openai",
        label: "OpenAI",
        enabled: Boolean(env.openAiApiKey),
        defaultModel: env.openAiApiKey ? env.openAiModel : null,
        webSearchEnabled: env.openAiWebSearchEnabled
      },
      {
        id: "anthropic",
        label: "Anthropic",
        enabled: Boolean(env.anthropicApiKey),
        defaultModel: env.anthropicApiKey ? env.anthropicModel : null,
        webSearchEnabled: env.anthropicWebSearchEnabled
      }
    ]
  };
};

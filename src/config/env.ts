import { ExecutionMode, NetworkMode, StoreProvider } from "../domain/types.js";

const toPort = (value: string | undefined): number => {
  const parsed = Number(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return 4000;
  }

  return parsed;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return fallback;
};

const splitCsv = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
};

const parseExecutionMode = (value: string | undefined): ExecutionMode => {
  return value === "live" ? "live" : "simulated";
};

const defaultExecutionMode = parseExecutionMode(process.env.EXECUTION_MODE ?? "live");

const parseNetworkMode = (value: string | undefined): NetworkMode => {
  if (!value) {
    return defaultExecutionMode === "live" ? "mainnet" : "testnet";
  }

  return value === "mainnet" ? "mainnet" : "testnet";
};

const parseStoreProvider = (value: string | undefined): StoreProvider => {
  return value === "memory" ? "memory" : "mongodb";
};

const toPolymarketChainId = (value: string | undefined): number => {
  const parsed = Number(value);

  if (parsed === 137 || parsed === 80002) {
    return parsed;
  }

  return defaultExecutionMode === "live" ? 137 : 80002;
};

export const env = {
  port: toPort(process.env.PORT),
  allowedOrigins: splitCsv(process.env.ALLOWED_ORIGINS, [
    "http://localhost:3000",
    "https://polymarket.com",
    "https://*.polymarket.com",
    "chrome-extension://*"
  ]),
  networkMode: parseNetworkMode(process.env.NETWORK_MODE),
  polygonNetwork:
    process.env.POLYGON_NETWORK ?? (defaultExecutionMode === "live" ? "polygon" : "amoy"),
  polymarketEnvironment:
    process.env.POLYMARKET_ENVIRONMENT ?? (defaultExecutionMode === "live" ? "production" : "testnet-simulated"),
  polymarketHost: process.env.POLYMARKET_HOST ?? "https://clob.polymarket.com",
  polymarketGammaHost: process.env.POLYMARKET_GAMMA_HOST ?? "https://gamma-api.polymarket.com",
  polymarketChainId: toPolymarketChainId(process.env.POLYMARKET_CHAIN_ID),
  polymarketMarketSource: process.env.POLYMARKET_MARKET_SOURCE === "seed" ? ("seed" as const) : ("live" as const),
  polymarketMarketLimit: toPositiveInt(process.env.POLYMARKET_MARKET_LIMIT, 48),
  polymarketMarketCacheTtlMs: toPositiveInt(process.env.POLYMARKET_MARKET_CACHE_TTL_MS, 30000),
  executionMode: defaultExecutionMode,
  storeProvider: parseStoreProvider(process.env.STORE_PROVIDER),
  storeFallbackToMemory: parseBoolean(process.env.STORE_FALLBACK_TO_MEMORY, true),
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "edgemarkets",
  mongodbServerSelectionTimeoutMs: toPositiveInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 4000),
  triggerWorkerEnabled: parseBoolean(
    process.env.TRIGGER_WORKER_ENABLED,
    defaultExecutionMode !== "live"
  ),
  triggerWorkerIntervalMs: toPositiveInt(process.env.TRIGGER_WORKER_INTERVAL_MS, 6000),
  triggerWorkerBatchSize: toPositiveInt(process.env.TRIGGER_WORKER_BATCH_SIZE, 10),
  triggerWorkerRetryDelayMs: toPositiveInt(process.env.TRIGGER_WORKER_RETRY_DELAY_MS, 15000),
  authHandoffTtlSeconds: toPositiveInt(process.env.AUTH_HANDOFF_TTL_SECONDS, 600),
  authChallengeTtlSeconds: toPositiveInt(process.env.AUTH_CHALLENGE_TTL_SECONDS, 300),
  authMessageDomain: process.env.AUTH_MESSAGE_DOMAIN ?? "edgemarkets.xyz",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiWebSearchEnabled: parseBoolean(process.env.OPENAI_WEB_SEARCH_ENABLED, false),
  openAiTimeoutMs: toPositiveInt(process.env.OPENAI_TIMEOUT_MS, 20000),
  aiInsightCacheTtlMs: toPositiveInt(process.env.AI_INSIGHT_CACHE_TTL_MS, 300000)
};

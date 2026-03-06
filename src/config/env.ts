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

const parseNetworkMode = (value: string | undefined): NetworkMode => {
  return value === "mainnet" ? "mainnet" : "testnet";
};

const parseExecutionMode = (value: string | undefined): ExecutionMode => {
  return value === "live" ? "live" : "simulated";
};

const parseStoreProvider = (value: string | undefined): StoreProvider => {
  return value === "memory" ? "memory" : "mongodb";
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
  polygonNetwork: process.env.POLYGON_NETWORK ?? "amoy",
  polymarketEnvironment: process.env.POLYMARKET_ENVIRONMENT ?? "testnet-simulated",
  executionMode: parseExecutionMode(process.env.EXECUTION_MODE),
  storeProvider: parseStoreProvider(process.env.STORE_PROVIDER),
  storeFallbackToMemory: parseBoolean(process.env.STORE_FALLBACK_TO_MEMORY, true),
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "edgemarkets",
  mongodbServerSelectionTimeoutMs: toPositiveInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 4000),
  triggerWorkerEnabled: parseBoolean(process.env.TRIGGER_WORKER_ENABLED, true),
  triggerWorkerIntervalMs: toPositiveInt(process.env.TRIGGER_WORKER_INTERVAL_MS, 6000),
  triggerWorkerBatchSize: toPositiveInt(process.env.TRIGGER_WORKER_BATCH_SIZE, 10),
  triggerWorkerRetryDelayMs: toPositiveInt(process.env.TRIGGER_WORKER_RETRY_DELAY_MS, 15000),
  authHandoffTtlSeconds: toPositiveInt(process.env.AUTH_HANDOFF_TTL_SECONDS, 600)
};

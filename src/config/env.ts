import { ExecutionMode, NetworkMode, StoreProvider } from "../domain/types.js";

const toPort = (value: string | undefined): number => {
  const parsed = Number(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return 4000;
  }

  return parsed;
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
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "edgemarkets"
};

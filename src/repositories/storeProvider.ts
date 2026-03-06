import { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { StoreProvider } from "../domain/types.js";
import { DataStore } from "./dataStore.js";
import { InMemoryStore } from "./inMemoryStore.js";
import { MongoStore } from "./mongoStore.js";

let activeStore: DataStore | null = null;
let activeStoreProvider: StoreProvider | null = null;

const createStore = (provider: StoreProvider): DataStore => {
  if (provider === "memory") {
    return new InMemoryStore();
  }

  return new MongoStore(
    env.mongodbUri,
    env.mongodbDatabase,
    env.mongodbServerSelectionTimeoutMs
  );
};

const activateStore = (store: DataStore, provider: StoreProvider): void => {
  activeStore = store;
  activeStoreProvider = provider;
};

const logStoreInitialized = (logger: FastifyBaseLogger): void => {
  logger.info(
    {
      storeProvider: activeStoreProvider,
      preferredStoreProvider: env.storeProvider,
      mongodbDatabase: env.mongodbDatabase
    },
    "EdgeMarkets data store initialized."
  );
};

export const initializeStore = async (logger: FastifyBaseLogger): Promise<DataStore> => {
  if (activeStore) {
    return activeStore;
  }

  const preferredProvider = env.storeProvider;
  const preferredStore = createStore(preferredProvider);

  try {
    await preferredStore.connect();
    activateStore(preferredStore, preferredProvider);
    logStoreInitialized(logger);
    return preferredStore;
  } catch (error) {
    if (preferredProvider !== "mongodb" || !env.storeFallbackToMemory) {
      throw error;
    }

    logger.error(
      {
        err: error
      },
      "MongoDB store initialization failed."
    );

    const fallbackStore = createStore("memory");
    await fallbackStore.connect();
    activateStore(fallbackStore, "memory");
    logger.warn(
      {
        preferredStoreProvider: preferredProvider,
        fallbackStoreProvider: "memory"
      },
      "Falling back to in-memory store because MongoDB is unavailable."
    );
    logStoreInitialized(logger);
    return fallbackStore;
  }
};

export const getActiveStoreProvider = (): StoreProvider => {
  if (!activeStoreProvider) {
    throw new Error("Data store provider has not been initialized.");
  }

  return activeStoreProvider;
};

export const getStore = (): DataStore => {
  if (!activeStore) {
    throw new Error("Data store has not been initialized.");
  }

  return activeStore;
};

export const closeStore = async (): Promise<void> => {
  if (!activeStore) {
    return;
  }

  await activeStore.close();
  activeStore = null;
  activeStoreProvider = null;
};

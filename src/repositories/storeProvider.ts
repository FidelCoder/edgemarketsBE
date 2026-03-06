import { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { DataStore } from "./dataStore.js";
import { InMemoryStore } from "./inMemoryStore.js";
import { MongoStore } from "./mongoStore.js";

let activeStore: DataStore | null = null;

const createStore = (): DataStore => {
  if (env.storeProvider === "memory") {
    return new InMemoryStore();
  }

  return new MongoStore(env.mongodbUri, env.mongodbDatabase);
};

export const initializeStore = async (logger: FastifyBaseLogger): Promise<DataStore> => {
  if (activeStore) {
    return activeStore;
  }

  const store = createStore();
  await store.connect();

  activeStore = store;
  logger.info(
    {
      storeProvider: env.storeProvider,
      mongodbDatabase: env.mongodbDatabase
    },
    "EdgeMarkets data store initialized."
  );

  return store;
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
};

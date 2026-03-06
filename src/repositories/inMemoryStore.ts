import {
  Follow,
  Market,
  StablecoinAsset,
  Strategy
} from "../domain/types.js";
import { createId } from "../utils/id.js";
import { DataStore } from "./dataStore.js";
import {
  createSeedMarkets,
  createSeedStablecoins,
  createSeedStrategies
} from "./seedData.js";

const nowIso = (): string => new Date().toISOString();

export class InMemoryStore implements DataStore {
  private markets: Market[];
  private strategies: Strategy[];
  private follows: Follow[];
  private stablecoins: StablecoinAsset[];

  constructor() {
    this.markets = createSeedMarkets();
    this.strategies = createSeedStrategies();
    this.follows = [];
    this.stablecoins = createSeedStablecoins();
  }

  public async connect(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public async listMarkets(): Promise<Market[]> {
    return this.markets;
  }

  public async listStablecoins(): Promise<StablecoinAsset[]> {
    return this.stablecoins;
  }

  public async getMarketById(marketId: string): Promise<Market | undefined> {
    return this.markets.find((market) => market.id === marketId);
  }

  public async listStrategies(): Promise<Strategy[]> {
    return this.strategies;
  }

  public async getStrategyById(strategyId: string): Promise<Strategy | undefined> {
    return this.strategies.find((strategy) => strategy.id === strategyId);
  }

  public async createStrategy(
    strategy: Omit<Strategy, "id" | "createdAt" | "followerCount">
  ): Promise<Strategy> {
    const created: Strategy = {
      ...strategy,
      id: createId(),
      followerCount: 0,
      createdAt: nowIso()
    };

    this.strategies = [created, ...this.strategies];
    return created;
  }

  public async listFollowsByUser(userId: string): Promise<Follow[]> {
    return this.follows.filter((follow) => follow.userId === userId);
  }

  public async getFollowByUserAndStrategy(
    userId: string,
    strategyId: string
  ): Promise<Follow | undefined> {
    return this.follows.find((follow) => follow.userId === userId && follow.strategyId === strategyId);
  }

  public async createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow> {
    const created: Follow = {
      ...follow,
      id: createId(),
      status: "active",
      createdAt: nowIso()
    };

    this.follows = [created, ...this.follows];
    this.strategies = this.strategies.map((strategy) =>
      strategy.id === follow.strategyId
        ? {
            ...strategy,
            followerCount: strategy.followerCount + 1
          }
        : strategy
    );

    return created;
  }
}

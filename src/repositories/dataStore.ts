import {
  Follow,
  Market,
  StablecoinAsset,
  Strategy
} from "../domain/types.js";

export interface DataStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  listMarkets(): Promise<Market[]>;
  listStablecoins(): Promise<StablecoinAsset[]>;
  getMarketById(marketId: string): Promise<Market | undefined>;
  listStrategies(): Promise<Strategy[]>;
  getStrategyById(strategyId: string): Promise<Strategy | undefined>;
  createStrategy(strategy: Omit<Strategy, "id" | "createdAt" | "followerCount">): Promise<Strategy>;
  listFollowsByUser(userId: string): Promise<Follow[]>;
  getFollowByUserAndStrategy(userId: string, strategyId: string): Promise<Follow | undefined>;
  createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow>;
}

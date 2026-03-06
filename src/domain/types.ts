export type TriggerType = "price_above" | "price_below" | "time_window";

export type ActionType = "buy_yes" | "buy_no" | "sell_yes" | "sell_no";

export type FollowStatus = "active" | "paused";

export type StablecoinSymbol = "USDC" | "USDT" | "DAI";

export type NetworkMode = "testnet" | "mainnet";

export type ExecutionMode = "simulated" | "live";

export type StoreProvider = "mongodb" | "memory";

export interface Market {
  id: string;
  question: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  liquidityUsd: number;
  updatedAt: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  marketId: string;
  triggerType: TriggerType;
  conditionValue: number;
  action: ActionType;
  allocationUsd: number;
  creatorHandle: string;
  followerCount: number;
  createdAt: string;
}

export interface StrategyWithMarket extends Strategy {
  market: Market;
}

export interface Follow {
  id: string;
  userId: string;
  strategyId: string;
  maxDailyLossUsd: number;
  maxMarketExposureUsd: number;
  fundingStablecoin: StablecoinSymbol;
  status: FollowStatus;
  createdAt: string;
}

export interface CreateStrategyInput {
  name: string;
  description: string;
  marketId: string;
  triggerType: TriggerType;
  conditionValue: number;
  action: ActionType;
  allocationUsd: number;
  creatorHandle: string;
}

export interface FollowStrategyInput {
  userId: string;
  maxDailyLossUsd: number;
  maxMarketExposureUsd: number;
  fundingStablecoin: StablecoinSymbol;
}

export interface StablecoinAsset {
  symbol: StablecoinSymbol;
  chain: "Polygon";
  settlementAsset: "USDC";
  conversionRequired: boolean;
}

export interface RuntimeConfig {
  networkMode: NetworkMode;
  polygonNetwork: string;
  polymarketEnvironment: string;
  executionMode: ExecutionMode;
  storeProvider: StoreProvider;
  supportedStablecoins: StablecoinSymbol[];
}

export interface SimulateFollowInput {
  strategyId: string;
  allocationUsd: number;
  fundingStablecoin: StablecoinSymbol;
}

export interface SimulateFollowResult {
  strategyId: string;
  strategyName: string;
  allocationUsd: number;
  fundingStablecoin: StablecoinSymbol;
  settlementAsset: "USDC";
  conversionRequired: boolean;
  estimatedFeesUsd: number;
  estimatedSettlementUsd: number;
  networkMode: NetworkMode;
  executionMode: ExecutionMode;
}

export interface ApiResponse<T> {
  data: T | null;
  error: {
    message: string;
  } | null;
}

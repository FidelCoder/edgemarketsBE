export type TriggerType = "price_above" | "price_below" | "time_window";

export type ActionType = "buy_yes" | "buy_no" | "sell_yes" | "sell_no";

export type FollowStatus = "active" | "paused";

export type StablecoinSymbol = "USDC" | "USDT" | "DAI";

export type NetworkMode = "testnet" | "mainnet";

export type ExecutionMode = "simulated" | "live";

export type StoreProvider = "mongodb" | "memory";

export type TriggerJobStatus = "pending" | "processing" | "completed" | "failed";

export type TriggerExecutionOutcome = "executed" | "failed" | "rescheduled";

export type AuditActorType = "user" | "system" | "worker";

export type AuthClient = "web" | "extension";

export type AuditEntityType =
  | "strategy"
  | "follow"
  | "trigger_job"
  | "execution_log"
  | "idempotency"
  | "worker"
  | "session"
  | "handoff";

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
  triggerWorkerEnabled: boolean;
  triggerWorkerIntervalMs: number;
  triggerWorkerBatchSize: number;
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

export interface TriggerJob {
  id: string;
  strategyId: string;
  userId: string;
  fundingStablecoin: StablecoinSymbol;
  allocationUsd: number;
  status: TriggerJobStatus;
  stateVersion: number;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface CreateTriggerJobInput {
  strategyId: string;
  userId: string;
  fundingStablecoin: StablecoinSymbol;
  allocationUsd: number;
  maxAttempts?: number;
}

export interface TriggerJobQuery {
  status?: TriggerJobStatus;
  userId?: string;
}

export interface ExecutionLog {
  id: string;
  jobId: string;
  strategyId: string;
  userId: string;
  outcome: TriggerExecutionOutcome;
  message: string;
  createdAt: string;
}

export interface CreateExecutionLogInput {
  jobId: string;
  strategyId: string;
  userId: string;
  outcome: TriggerExecutionOutcome;
  message: string;
}

export interface TriggerWorkerTickResult {
  processed: number;
  completed: number;
  rescheduled: number;
  failed: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actorType: AuditActorType;
  actorId: string;
  entityType: AuditEntityType;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAuditLogInput {
  action: string;
  actorType: AuditActorType;
  actorId: string;
  entityType: AuditEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogQuery {
  actorId?: string;
  entityType?: AuditEntityType;
  limit?: number;
}

export interface IdempotencyRecord {
  id: string;
  key: string;
  scope: string;
  requestHash: string;
  statusCode: number;
  responseBody: string;
  createdAt: string;
}

export interface CreateIdempotencyRecordInput {
  key: string;
  scope: string;
  requestHash: string;
  statusCode: number;
  responseBody: string;
}

export interface AuthSession {
  id: string;
  token: string;
  walletAddress: string;
  userId: string;
  client: AuthClient;
  linkedSessionId?: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface CreateAuthSessionInput {
  walletAddress: string;
  client: AuthClient;
  linkedSessionId?: string;
}

export interface SessionHandoff {
  id: string;
  code: string;
  sourceSessionId: string;
  walletAddress: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface CreateSessionHandoffInput {
  code: string;
  sourceSessionId: string;
  walletAddress: string;
  userId: string;
  expiresAt: string;
}

export interface CreateAuthSessionApiInput {
  walletAddress: string;
  client?: AuthClient;
}

export interface ConsumeSessionHandoffInput {
  handoffCode: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: {
    message: string;
  } | null;
}

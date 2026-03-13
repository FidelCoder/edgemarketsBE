export type TriggerType = "price_above" | "price_below" | "time_window";

export type ActionType = "buy_yes" | "buy_no" | "sell_yes" | "sell_no";

export type FollowStatus = "active" | "paused";

export type StablecoinSymbol = "USDC" | "USDT" | "DAI";

export type NetworkMode = "testnet" | "mainnet";

export type ExecutionMode = "simulated" | "live";

export type StoreProvider = "mongodb" | "memory";

export type AiProvider = "openai" | "anthropic";

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
  | "handoff"
  | "order"
  | "market_insight";

export interface ApiResponse<T> {
  data: T | null;
  error: {
    message: string;
  } | null;
}

export type OrderLifecycleStatus = "submitted" | "open" | "filled" | "failed" | "retried";

export type OrderSource = "strategy" | "agent";

export type PolymarketOrderSide = "BUY" | "SELL";

export type PolymarketOrderType = "GTC" | "FOK" | "GTD" | "FAK";

export type PolymarketTradeStatus = "MATCHED" | "MINED" | "CONFIRMED" | "RETRYING" | "FAILED" | "UNKNOWN";

export interface Market {
  id: string;
  question: string;
  category: string;
  subcategory: string;
  yesPrice: number;
  noPrice: number;
  liquidityUsd: number;
  updatedAt: string;
  slug: string;
  icon: string | null;
  endDate: string | null;
  yesTokenId: string;
  noTokenId: string;
  orderBookEnabled: boolean;
  negRisk: boolean;
}

export interface MarketPricePoint {
  timestamp: string;
  price: number;
}

export interface MarketComment {
  id: string;
  body: string;
  userAddress: string | null;
  displayName: string | null;
  pseudonym: string | null;
  profileImage: string | null;
  reactionCount: number;
  createdAt: string;
}

export interface MarketContext {
  marketId: string;
  question: string;
  description: string | null;
  resolutionSource: string | null;
  image: string | null;
  featuredImage: string | null;
  eventTitle: string | null;
  eventSubtitle: string | null;
  eventSlug: string | null;
  volume24hr: number | null;
  commentCount: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  commentsEnabled: boolean;
  priceHistory: MarketPricePoint[];
  comments: MarketComment[];
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
  polymarketHost: string;
  polymarketGammaHost: string;
  polymarketChainId: number;
  polymarketMarketSource: "live" | "seed";
  executionMode: ExecutionMode;
  storeProvider: StoreProvider;
  triggerWorkerEnabled: boolean;
  triggerWorkerIntervalMs: number;
  triggerWorkerBatchSize: number;
  supportedStablecoins: StablecoinSymbol[];
  aiEnabled: boolean;
  aiDefaultProvider: AiProvider | null;
  aiModel: string | null;
  aiWebSearchEnabled: boolean;
  aiProviders: AiProviderSummary[];
}

export type MarketInsightTradeBias = "buy_yes" | "buy_no" | "wait";

export interface GenerateMarketInsightInput {
  marketId: string;
  angle?: string;
  provider?: AiProvider;
  model?: string;
}

export interface MarketInsight {
  marketId: string;
  marketQuestion: string;
  marketProbabilityYes: number;
  fairProbabilityYes: number;
  edgePercentagePoints: number;
  confidence: number;
  provider: AiProvider;
  tradeBias: MarketInsightTradeBias;
  timeHorizon: string;
  summary: string;
  thesis: string;
  counterThesis: string;
  keyCatalysts: string[];
  riskFlags: string[];
  executionPlan: string[];
  sources: MarketInsightSource[];
  disclaimer: string;
  angle?: string;
  model: string;
  generatedAt: string;
}

export interface MarketInsightSource {
  title: string;
  url: string;
}

export interface AutomationHaltRules {
  maxDrawdownPct: number;
  dailyLossLimitUsd: number;
  maxConsecutiveLosses: number;
}

export interface AutomationPlanLeg {
  marketId: string;
  question: string;
  category: string;
  subcategory: string;
  action: "buy_yes" | "buy_no";
  allocationUsd: number;
  marketProbabilityYes: number;
  fairProbabilityYes: number;
  conviction: number;
  rationale: string;
  riskNote: string;
  maxHoldingHours: number;
  stopLossProbability: number;
  takeProfitProbability: number;
}

export interface GenerateAutomationPlanInput {
  bankrollUsd: number;
  targetReturnPct: number;
  timeHorizonDays: number;
  maxDrawdownPct: number;
  dailyLossLimitUsd: number;
  maxPositions: number;
  reserveRatio: number;
  profitReinvestmentPct: number;
  rebalanceIntervalHours: number;
  maxConsecutiveLosses: number;
  preferredCategories?: string[];
  provider?: AiProvider;
  model?: string;
  objective?: string;
}

export interface AutomationPlan {
  bankrollUsd: number;
  deployableUsd: number;
  reserveUsd: number;
  targetReturnPct: number;
  timeHorizonDays: number;
  rebalanceIntervalHours: number;
  profitReinvestmentPct: number;
  haltRules: AutomationHaltRules;
  summary: string;
  compoundingNote: string;
  reviewPlan: string[];
  safeguards: string[];
  provider: AiProvider;
  model: string;
  objective?: string;
  legs: AutomationPlanLeg[];
  sources: MarketInsightSource[];
  generatedAt: string;
}

export type AgentSessionStatus = "draft" | "running" | "halted";

export interface AgentEvaluationSnapshot {
  deployedUsd: number;
  markToMarketPnlUsd: number;
  dayPnlUsd: number;
  drawdownPct: number;
  consecutiveLosses: number;
  haltTriggered: boolean;
  haltReason?: string;
  executedOrders: number;
  effectiveBankrollUsd: number;
}

export interface AgentSession {
  id: string;
  userId: string;
  walletAddress: string;
  status: AgentSessionStatus;
  plan: AutomationPlan;
  executedOrderIds: string[];
  executedMarketIds: string[];
  haltReason?: string;
  lastEvaluation?: AgentEvaluationSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAgentSessionInput {
  userId: string;
  walletAddress: string;
  status: AgentSessionStatus;
  plan: AutomationPlan;
  executedOrderIds: string[];
  executedMarketIds: string[];
  haltReason?: string;
  lastEvaluation?: AgentEvaluationSnapshot;
}

export interface AiProviderSummary {
  id: AiProvider;
  label: string;
  enabled: boolean;
  defaultModel: string | null;
  webSearchEnabled: boolean;
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

export interface AuthChallenge {
  id: string;
  walletAddress: string;
  client: AuthClient;
  nonce: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface CreateAuthChallengeInput {
  walletAddress: string;
  client: AuthClient;
  origin?: string;
}

export interface VerifyAuthChallengeInput {
  challengeId: string;
  walletAddress: string;
  signature: string;
  client: AuthClient;
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

export interface PolymarketPublicProfile {
  walletAddress: string;
  proxyWalletAddress: string | null;
  username: string | null;
  pseudonym: string | null;
  profileImage: string | null;
}

export interface OrderRecord {
  id: string;
  polymarketOrderId: string;
  source: OrderSource;
  strategyId: string;
  creatorHandle: string;
  marketId: string;
  userId: string;
  walletAddress: string;
  funderAddress: string;
  tokenId: string;
  outcome: "YES" | "NO";
  action: ActionType;
  side: PolymarketOrderSide;
  orderType: PolymarketOrderType;
  price: number;
  size: number;
  amountUsd: number;
  status: OrderLifecycleStatus;
  tradeStatus: PolymarketTradeStatus;
  transactionHashes: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  filledAt?: string;
}

export interface CreateOrderRecordInput {
  polymarketOrderId: string;
  source: OrderSource;
  strategyId: string;
  creatorHandle: string;
  marketId: string;
  userId: string;
  walletAddress: string;
  funderAddress: string;
  tokenId: string;
  outcome: "YES" | "NO";
  action: ActionType;
  side: PolymarketOrderSide;
  orderType: PolymarketOrderType;
  price: number;
  size: number;
  amountUsd: number;
  status: OrderLifecycleStatus;
  tradeStatus: PolymarketTradeStatus;
  transactionHashes?: string[];
  errorMessage?: string;
  filledAt?: string;
}

export interface OrderRecordQuery {
  strategyId?: string;
  creatorHandle?: string;
  status?: OrderLifecycleStatus;
  limit?: number;
}

export interface CreatorPerformanceSummary {
  creatorHandle: string;
  strategyCount: number;
  totalFollowers: number;
  totalOrders: number;
  openOrders: number;
  filledOrders: number;
  failedOrders: number;
  retriedOrders: number;
  totalVolumeUsd: number;
  fillRate: number;
  latestOrderAt?: string;
}

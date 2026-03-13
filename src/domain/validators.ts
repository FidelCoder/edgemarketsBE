import { z } from "zod";

export const createStrategySchema = z.object({
  name: z.string().min(3).max(70),
  description: z.string().min(10).max(240),
  marketId: z.string().min(2),
  triggerType: z.enum(["price_above", "price_below", "time_window"]),
  conditionValue: z.number().positive(),
  action: z.enum(["buy_yes", "buy_no", "sell_yes", "sell_no"]),
  allocationUsd: z.number().positive().max(1000000),
  creatorHandle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/)
});

export const followStrategySchema = z.object({
  userId: z.string().min(3).max(64),
  maxDailyLossUsd: z.number().positive().max(1000000),
  maxMarketExposureUsd: z.number().positive().max(1000000),
  fundingStablecoin: z.enum(["USDC", "USDT", "DAI"])
});

export const userParamsSchema = z.object({
  userId: z.string().min(3).max(64)
});

export const creatorParamsSchema = z.object({
  creatorHandle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/)
});

export const walletAddressParamsSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export const strategyParamsSchema = z.object({
  strategyId: z.string().min(2)
});

export const marketParamsSchema = z.object({
  marketId: z.string().min(2)
});

export const simulateFollowSchema = z.object({
  strategyId: z.string().min(2),
  allocationUsd: z.number().positive().max(1000000),
  fundingStablecoin: z.enum(["USDC", "USDT", "DAI"])
});

export const createTriggerJobSchema = z.object({
  strategyId: z.string().min(2),
  userId: z.string().min(3).max(64),
  fundingStablecoin: z.enum(["USDC", "USDT", "DAI"]),
  allocationUsd: z.number().positive().max(1000000),
  maxAttempts: z.number().int().min(1).max(10).optional()
});

export const triggerJobQuerySchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  userId: z.string().min(3).max(64).optional()
});

export const executionLogQuerySchema = z.object({
  userId: z.string().min(3).max(64).optional()
});

export const triggerWorkerRunSchema = z.object({
  maxJobs: z.number().int().min(1).max(50).optional()
});

export const agentWorkerRunSchema = z.object({
  maxSessions: z.number().int().min(1).max(50).optional()
});

export const auditLogQuerySchema = z.object({
  actorId: z.string().min(3).max(64).optional(),
  entityType: z
    .enum([
      "strategy",
      "follow",
      "trigger_job",
      "execution_log",
      "idempotency",
      "worker",
      "session",
      "handoff",
      "order",
      "market_insight"
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export const generateMarketInsightSchema = z.object({
  marketId: z.string().min(2),
  angle: z.string().trim().min(3).max(240).optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
  model: z.string().trim().min(2).max(80).optional()
});

export const generateAutomationPlanSchema = z.object({
  bankrollUsd: z.number().positive().max(10000000),
  targetReturnPct: z.number().min(1).max(500),
  timeHorizonDays: z.number().int().min(1).max(365),
  maxDrawdownPct: z.number().min(1).max(80),
  dailyLossLimitUsd: z.number().positive().max(10000000),
  maxPositions: z.number().int().min(1).max(12),
  reserveRatio: z.number().min(0.05).max(0.7),
  profitReinvestmentPct: z.number().min(0).max(100),
  rebalanceIntervalHours: z.number().int().min(4).max(168),
  maxConsecutiveLosses: z.number().int().min(1).max(10),
  preferredCategories: z.array(z.string().min(2).max(40)).max(8).optional(),
  provider: z.enum(["openai", "anthropic"]).optional(),
  model: z.string().trim().min(2).max(80).optional(),
  objective: z.string().trim().min(3).max(240).optional()
});

const persistedAutomationPlanLegSchema = z.object({
  marketId: z.string().min(2),
  question: z.string().min(3).max(240),
  category: z.string().min(2).max(80),
  subcategory: z.string().min(2).max(80),
  action: z.enum(["buy_yes", "buy_no"]),
  allocationUsd: z.number().positive().max(10000000),
  marketProbabilityYes: z.number().min(0).max(1),
  fairProbabilityYes: z.number().min(0).max(1),
  conviction: z.number().min(0).max(1),
  rationale: z.string().min(10).max(260),
  riskNote: z.string().min(10).max(220),
  maxHoldingHours: z.number().int().min(1).max(720),
  stopLossProbability: z.number().min(0).max(1),
  takeProfitProbability: z.number().min(0).max(1)
});

const persistedAutomationPlanSchema = z.object({
  bankrollUsd: z.number().positive().max(10000000),
  deployableUsd: z.number().positive().max(10000000),
  reserveUsd: z.number().min(0).max(10000000),
  targetReturnPct: z.number().min(1).max(500),
  timeHorizonDays: z.number().int().min(1).max(365),
  rebalanceIntervalHours: z.number().int().min(1).max(168),
  profitReinvestmentPct: z.number().min(0).max(100),
  haltRules: z.object({
    maxDrawdownPct: z.number().min(1).max(80),
    dailyLossLimitUsd: z.number().positive().max(10000000),
    maxConsecutiveLosses: z.number().int().min(1).max(10)
  }),
  summary: z.string().min(20).max(500),
  compoundingNote: z.string().min(10).max(260),
  reviewPlan: z.array(z.string().min(3).max(180)).min(1).max(8),
  safeguards: z.array(z.string().min(3).max(180)).min(1).max(8),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().min(2).max(80),
  objective: z.string().trim().min(3).max(240).optional(),
  legs: z.array(persistedAutomationPlanLegSchema).min(1).max(12),
  sources: z.array(z.object({ title: z.string().min(1).max(200), url: z.string().url() })).max(12),
  generatedAt: z.string().datetime()
});

export const upsertAgentSessionSchema = z.object({
  status: z.enum(["draft", "running", "halted"]),
  plan: persistedAutomationPlanSchema,
  executedOrderIds: z.array(z.string().min(2)).max(200),
  executedMarketIds: z.array(z.string().min(2)).max(50),
  haltReason: z.string().trim().min(3).max(240).optional(),
  lastEvaluation: z
    .object({
      deployedUsd: z.number().min(0).max(10000000),
      markToMarketPnlUsd: z.number().min(-10000000).max(10000000),
      dayPnlUsd: z.number().min(-10000000).max(10000000),
      drawdownPct: z.number().min(0).max(100),
      consecutiveLosses: z.number().int().min(0).max(100),
      haltTriggered: z.boolean(),
      haltReason: z.string().trim().min(3).max(240).optional(),
      executedOrders: z.number().int().min(0).max(1000),
      effectiveBankrollUsd: z.number().min(-10000000).max(10000000)
    })
    .optional()
});

export const createAuthChallengeSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  client: z.enum(["web", "extension"]).optional()
});

export const verifyAuthChallengeSchema = z.object({
  challengeId: z.string().min(2),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  client: z.enum(["web", "extension"]).optional()
});

export const consumeHandoffSchema = z.object({
  handoffCode: z.string().regex(/^EM-[A-Z0-9]{8}$/)
});

export const orderLifecycleStatusSchema = z.enum(["submitted", "open", "filled", "failed", "retried"]);

export const tradeStatusSchema = z.enum(["MATCHED", "MINED", "CONFIRMED", "RETRYING", "FAILED", "UNKNOWN"]);

export const createOrderRecordSchema = z.object({
  polymarketOrderId: z.string().min(2),
  source: z.enum(["strategy", "agent"]),
  strategyId: z.string().min(2),
  creatorHandle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/),
  marketId: z.string().min(2),
  userId: z.string().min(3).max(64),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  funderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenId: z.string().min(2),
  outcome: z.enum(["YES", "NO"]),
  action: z.enum(["buy_yes", "buy_no", "sell_yes", "sell_no"]),
  side: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["GTC", "FOK", "GTD", "FAK"]),
  price: z.number().positive().max(1),
  size: z.number().positive().max(1000000000),
  amountUsd: z.number().positive().max(1000000),
  status: orderLifecycleStatusSchema,
  tradeStatus: tradeStatusSchema,
  transactionHashes: z.array(z.string().min(1)).max(10).optional(),
  errorMessage: z.string().max(500).optional(),
  filledAt: z.string().datetime().optional()
});

export const orderQuerySchema = z.object({
  userId: z.string().min(3).max(64).optional(),
  strategyId: z.string().min(2).optional(),
  creatorHandle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  status: orderLifecycleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

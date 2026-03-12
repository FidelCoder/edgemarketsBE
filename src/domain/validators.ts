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
  strategyId: z.string().min(2).optional(),
  creatorHandle: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  status: orderLifecycleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

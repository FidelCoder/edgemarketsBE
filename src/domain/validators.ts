import { z } from "zod";

export const createStrategySchema = z.object({
  name: z.string().min(3).max(70),
  description: z.string().min(10).max(240),
  marketId: z.string().min(2),
  triggerType: z.enum(["price_above", "price_below", "time_window"]),
  conditionValue: z.number().positive(),
  action: z.enum(["buy_yes", "buy_no", "sell_yes", "sell_no"]),
  allocationUsd: z.number().positive().max(1000000),
  creatorHandle: z.string().min(2).max(24)
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

export const strategyParamsSchema = z.object({
  strategyId: z.string().min(2)
});

export const simulateFollowSchema = z.object({
  strategyId: z.string().min(2),
  allocationUsd: z.number().positive().max(1000000),
  fundingStablecoin: z.enum(["USDC", "USDT", "DAI"])
});

import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  CreateTriggerJobInput,
  ExecutionLog,
  Market,
  Strategy,
  TriggerJob,
  TriggerJobQuery,
  TriggerWorkerTickResult
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";

const resolveRelevantPrice = (strategy: Strategy, market: Market): number => {
  return strategy.action.endsWith("yes") ? market.yesPrice : market.noPrice;
};

const shouldExecuteTrigger = (strategy: Strategy, market: Market): boolean => {
  const price = resolveRelevantPrice(strategy, market);

  if (strategy.triggerType === "price_above") {
    return price >= strategy.conditionValue;
  }

  if (strategy.triggerType === "price_below") {
    return price <= strategy.conditionValue;
  }

  // Time-window rules are treated as due immediately in this MVP worker.
  return true;
};

const getRetryTimestamp = (attemptCount: number): string => {
  const delayMs = env.triggerWorkerRetryDelayMs * Math.max(1, attemptCount);
  return new Date(Date.now() + delayMs).toISOString();
};

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown trigger worker error.";
};

export const listTriggerJobs = async (query?: TriggerJobQuery): Promise<TriggerJob[]> => {
  const store = getStore();
  return store.listTriggerJobs(query);
};

export const createTriggerJob = async (payload: CreateTriggerJobInput): Promise<TriggerJob> => {
  const store = getStore();

  const [strategy, stablecoins] = await Promise.all([
    store.getStrategyById(payload.strategyId),
    store.listStablecoins()
  ]);

  if (!strategy) {
    throw new AppError("Cannot enqueue job: strategy does not exist.", 404);
  }

  const stablecoin = stablecoins.find((asset) => asset.symbol === payload.fundingStablecoin);

  if (!stablecoin) {
    throw new AppError("Cannot enqueue job: stablecoin not supported.", 400);
  }

  return store.createTriggerJob(payload);
};

export const listExecutionLogs = async (userId?: string): Promise<ExecutionLog[]> => {
  const store = getStore();
  return store.listExecutionLogs(userId);
};

export const processTriggerJobsTick = async (maxJobs: number): Promise<TriggerWorkerTickResult> => {
  const store = getStore();
  const summary: TriggerWorkerTickResult = {
    processed: 0,
    completed: 0,
    rescheduled: 0,
    failed: 0
  };

  for (let index = 0; index < maxJobs; index += 1) {
    const claimed = await store.claimNextTriggerJob(new Date().toISOString());

    if (!claimed) {
      break;
    }

    summary.processed += 1;

    try {
      const strategy = await store.getStrategyById(claimed.strategyId);

      if (!strategy) {
        await store.failTriggerJob(claimed.id, "Strategy not found.");
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: "Job failed: strategy not found."
        });
        summary.failed += 1;
        continue;
      }

      const market = await store.getMarketById(strategy.marketId);

      if (!market) {
        await store.failTriggerJob(claimed.id, "Market not found for strategy.");
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: "Job failed: market not found for strategy."
        });
        summary.failed += 1;
        continue;
      }

      const shouldExecute = shouldExecuteTrigger(strategy, market);

      if (shouldExecute) {
        await store.completeTriggerJob(claimed.id);
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "executed",
          message: `Executed at price ${resolveRelevantPrice(strategy, market).toFixed(4)}.`
        });
        summary.completed += 1;
        continue;
      }

      if (claimed.attemptCount < claimed.maxAttempts) {
        const retryAt = getRetryTimestamp(claimed.attemptCount);
        await store.failTriggerJob(claimed.id, "Trigger condition not met yet.", retryAt);
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "rescheduled",
          message: `Condition not met, rescheduled for ${retryAt}.`
        });
        summary.rescheduled += 1;
        continue;
      }

      await store.failTriggerJob(claimed.id, "Max attempts reached without trigger condition match.");
      await store.createExecutionLog({
        jobId: claimed.id,
        strategyId: claimed.strategyId,
        userId: claimed.userId,
        outcome: "failed",
        message: "Max attempts reached without trigger condition match."
      });
      summary.failed += 1;
    } catch (error) {
      const errorMessage = toErrorMessage(error);

      if (claimed.attemptCount < claimed.maxAttempts) {
        const retryAt = getRetryTimestamp(claimed.attemptCount);
        await store.failTriggerJob(claimed.id, errorMessage, retryAt);
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "rescheduled",
          message: `Error during execution, rescheduled: ${errorMessage}`
        });
        summary.rescheduled += 1;
      } else {
        await store.failTriggerJob(claimed.id, errorMessage);
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: `Execution failed permanently: ${errorMessage}`
        });
        summary.failed += 1;
      }
    }
  }

  return summary;
};

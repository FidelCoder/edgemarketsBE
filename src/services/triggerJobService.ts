import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  CreateTriggerJobInput,
  CreateAuditLogInput,
  ExecutionLog,
  Market,
  Strategy,
  TriggerJob,
  TriggerJobQuery,
  TriggerWorkerTickResult
} from "../domain/types.js";
import { DataStore } from "../repositories/dataStore.js";
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

const WORKER_ACTOR_ID = "trigger-worker";

const recordWorkerAudit = async (
  store: DataStore,
  payload: Omit<CreateAuditLogInput, "actorType" | "actorId">
): Promise<void> => {
  try {
    await store.createAuditLog({
      ...payload,
      actorType: "worker",
      actorId: WORKER_ACTOR_ID
    });
  } catch {
    // Worker audit failures should not block core execution.
  }
};

const assertJobTransition = (
  updatedJob: TriggerJob | undefined,
  transitionName: "complete" | "reschedule" | "fail",
  jobId: string
): TriggerJob => {
  if (!updatedJob) {
    throw new AppError(`Trigger transition "${transitionName}" was rejected for job ${jobId}.`, 500);
  }

  return updatedJob;
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

  const created = await store.createTriggerJob(payload);
  await store.createAuditLog({
    action: "trigger_job.created",
    actorType: "user",
    actorId: payload.userId,
    entityType: "trigger_job",
    entityId: created.id,
    metadata: {
      strategyId: payload.strategyId,
      fundingStablecoin: payload.fundingStablecoin,
      allocationUsd: payload.allocationUsd,
      maxAttempts: created.maxAttempts
    }
  });

  return created;
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
    await recordWorkerAudit(store, {
      action: "trigger_job.claimed",
      entityType: "trigger_job",
      entityId: claimed.id,
      metadata: {
        strategyId: claimed.strategyId,
        userId: claimed.userId,
        stateVersion: claimed.stateVersion,
        attemptCount: claimed.attemptCount
      }
    });

    try {
      const strategy = await store.getStrategyById(claimed.strategyId);

      if (!strategy) {
        const failed = assertJobTransition(
          await store.failTriggerJob(claimed.id, "Strategy not found."),
          "fail",
          claimed.id
        );
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: "Job failed: strategy not found."
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.failed",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            reason: "strategy_not_found",
            stateVersion: failed.stateVersion
          }
        });
        summary.failed += 1;
        continue;
      }

      const market = await store.getMarketById(strategy.marketId);

      if (!market) {
        const failed = assertJobTransition(
          await store.failTriggerJob(claimed.id, "Market not found for strategy."),
          "fail",
          claimed.id
        );
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: "Job failed: market not found for strategy."
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.failed",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            reason: "market_not_found",
            stateVersion: failed.stateVersion
          }
        });
        summary.failed += 1;
        continue;
      }

      const shouldExecute = shouldExecuteTrigger(strategy, market);

      if (shouldExecute) {
        const completed = assertJobTransition(
          await store.completeTriggerJob(claimed.id),
          "complete",
          claimed.id
        );

        const executedPrice = resolveRelevantPrice(strategy, market);

        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "executed",
          message: `Executed at price ${executedPrice.toFixed(4)}.`
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.completed",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            stateVersion: completed.stateVersion,
            executedPrice
          }
        });
        summary.completed += 1;
        continue;
      }

      if (claimed.attemptCount < claimed.maxAttempts) {
        const retryAt = getRetryTimestamp(claimed.attemptCount);
        const rescheduled = assertJobTransition(
          await store.failTriggerJob(claimed.id, "Trigger condition not met yet.", retryAt),
          "reschedule",
          claimed.id
        );
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "rescheduled",
          message: `Condition not met, rescheduled for ${retryAt}.`
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.rescheduled",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            retryAt,
            stateVersion: rescheduled.stateVersion,
            reason: "condition_not_met"
          }
        });
        summary.rescheduled += 1;
        continue;
      }

      const failed = assertJobTransition(
        await store.failTriggerJob(claimed.id, "Max attempts reached without trigger condition match."),
        "fail",
        claimed.id
      );
      await store.createExecutionLog({
        jobId: claimed.id,
        strategyId: claimed.strategyId,
        userId: claimed.userId,
        outcome: "failed",
        message: "Max attempts reached without trigger condition match."
      });
      await recordWorkerAudit(store, {
        action: "trigger_job.failed",
        entityType: "trigger_job",
        entityId: claimed.id,
        metadata: {
          reason: "max_attempts_reached",
          stateVersion: failed.stateVersion
        }
      });
      summary.failed += 1;
    } catch (error) {
      const errorMessage = toErrorMessage(error);

      if (claimed.attemptCount < claimed.maxAttempts) {
        const retryAt = getRetryTimestamp(claimed.attemptCount);
        const rescheduled = assertJobTransition(
          await store.failTriggerJob(claimed.id, errorMessage, retryAt),
          "reschedule",
          claimed.id
        );
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "rescheduled",
          message: `Error during execution, rescheduled: ${errorMessage}`
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.rescheduled",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            retryAt,
            reason: "worker_error",
            errorMessage,
            stateVersion: rescheduled.stateVersion
          }
        });
        summary.rescheduled += 1;
      } else {
        const failed = assertJobTransition(
          await store.failTriggerJob(claimed.id, errorMessage),
          "fail",
          claimed.id
        );
        await store.createExecutionLog({
          jobId: claimed.id,
          strategyId: claimed.strategyId,
          userId: claimed.userId,
          outcome: "failed",
          message: `Execution failed permanently: ${errorMessage}`
        });
        await recordWorkerAudit(store, {
          action: "trigger_job.failed",
          entityType: "trigger_job",
          entityId: claimed.id,
          metadata: {
            reason: "worker_error",
            errorMessage,
            stateVersion: failed.stateVersion
          }
        });
        summary.failed += 1;
      }
    }
  }

  return summary;
};

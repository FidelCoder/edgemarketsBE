import { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { processTriggerJobsTick } from "./triggerJobService.js";

let workerTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

const runWorkerTick = async (logger: FastifyBaseLogger): Promise<void> => {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    const summary = await processTriggerJobsTick(env.triggerWorkerBatchSize);

    if (summary.processed > 0) {
      logger.info(
        {
          processed: summary.processed,
          completed: summary.completed,
          rescheduled: summary.rescheduled,
          failed: summary.failed
        },
        "Trigger worker processed jobs."
      );
    }
  } catch (error) {
    logger.error(error, "Trigger worker tick failed.");
  } finally {
    isTickRunning = false;
  }
};

export const startTriggerWorker = (logger: FastifyBaseLogger): void => {
  if (!env.triggerWorkerEnabled) {
    logger.info("Trigger worker disabled by configuration.");
    return;
  }

  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    void runWorkerTick(logger);
  }, env.triggerWorkerIntervalMs);

  logger.info(
    {
      intervalMs: env.triggerWorkerIntervalMs,
      batchSize: env.triggerWorkerBatchSize
    },
    "Trigger worker started."
  );

  void runWorkerTick(logger);
};

export const stopTriggerWorker = (logger: FastifyBaseLogger): void => {
  if (!workerTimer) {
    return;
  }

  clearInterval(workerTimer);
  workerTimer = null;
  isTickRunning = false;
  logger.info("Trigger worker stopped.");
};

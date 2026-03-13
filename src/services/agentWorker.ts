import { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";
import { processAgentSessionsTick } from "./agentWorkerService.js";

let workerTimer: NodeJS.Timeout | null = null;
let isTickRunning = false;

const runWorkerTick = async (logger: FastifyBaseLogger): Promise<void> => {
  if (isTickRunning) {
    return;
  }

  isTickRunning = true;

  try {
    const summary = await processAgentSessionsTick(env.agentWorkerBatchSize);

    if (summary.reviewed > 0 || summary.halted > 0) {
      logger.info(summary, "Agent worker reviewed sessions.");
    }
  } catch (error) {
    logger.error(error, "Agent worker tick failed.");
  } finally {
    isTickRunning = false;
  }
};

export const startAgentWorker = (logger: FastifyBaseLogger): void => {
  if (!env.agentWorkerEnabled) {
    logger.info("Agent worker disabled by configuration.");
    return;
  }

  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    void runWorkerTick(logger);
  }, env.agentWorkerIntervalMs);

  logger.info(
    {
      intervalMs: env.agentWorkerIntervalMs,
      batchSize: env.agentWorkerBatchSize
    },
    "Agent worker started."
  );

  void runWorkerTick(logger);
};

export const stopAgentWorker = (logger: FastifyBaseLogger): void => {
  if (!workerTimer) {
    return;
  }

  clearInterval(workerTimer);
  workerTimer = null;
  isTickRunning = false;
  logger.info("Agent worker stopped.");
};

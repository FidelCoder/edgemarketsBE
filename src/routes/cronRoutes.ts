import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { assertCronAuthorized } from "../services/cronAuthService.js";
import { processAgentSessionsTick } from "../services/agentWorkerService.js";
import { processTriggerJobsTick } from "../services/triggerJobService.js";

export const registerCronRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/cron/trigger-worker", async (request) => {
    assertCronAuthorized(request.headers.authorization);

    return {
      data: {
        deploymentTarget: env.isVercel ? "vercel" : "self-hosted",
        summary: await processTriggerJobsTick(env.triggerWorkerBatchSize)
      },
      error: null
    };
  });

  app.get("/api/cron/agent-worker", async (request) => {
    assertCronAuthorized(request.headers.authorization);

    return {
      data: {
        deploymentTarget: env.isVercel ? "vercel" : "self-hosted",
        summary: await processAgentSessionsTick(env.agentWorkerBatchSize)
      },
      error: null
    };
  });
};

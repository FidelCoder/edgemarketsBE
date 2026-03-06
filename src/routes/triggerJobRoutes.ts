import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import {
  createTriggerJobSchema,
  executionLogQuerySchema,
  triggerJobQuerySchema,
  triggerWorkerRunSchema
} from "../domain/validators.js";
import {
  createTriggerJob,
  listExecutionLogs,
  listTriggerJobs,
  processTriggerJobsTick
} from "../services/triggerJobService.js";
import {
  parseIdempotencyKey,
  runIdempotentMutation
} from "../services/idempotencyService.js";

export const registerTriggerJobRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/trigger-jobs", async (request) => {
    const parsedQuery = triggerJobQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid trigger job query.", 400);
    }

    return {
      data: await listTriggerJobs(parsedQuery.data),
      error: null
    };
  });

  app.post("/api/trigger-jobs", async (request, reply) => {
    const parsedBody = createTriggerJobSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid trigger job payload.", 400);
    }

    const idempotencyKey = parseIdempotencyKey(request.headers["idempotency-key"]);
    const result = await runIdempotentMutation({
      scope: "trigger-jobs.create",
      actorId: parsedBody.data.userId,
      idempotencyKey,
      requestBody: parsedBody.data,
      execute: async () => ({
        statusCode: 201,
        body: {
          data: await createTriggerJob(parsedBody.data),
          error: null
        }
      })
    });

    reply.header("idempotency-status", result.key ? (result.replayed ? "replayed" : "created") : "none");

    if (result.key) {
      reply.header("idempotency-key", result.key);
    }

    reply.status(result.statusCode);
    return result.body;
  });

  app.post("/api/trigger-jobs/run-once", async (request) => {
    const parsedBody = triggerWorkerRunSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid worker payload.", 400);
    }

    const maxJobs = parsedBody.data.maxJobs ?? 10;

    return {
      data: await processTriggerJobsTick(maxJobs),
      error: null
    };
  });

  app.get("/api/execution-logs", async (request) => {
    const parsedQuery = executionLogQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid execution log query.", 400);
    }

    return {
      data: await listExecutionLogs(parsedQuery.data.userId),
      error: null
    };
  });
};

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../domain/errors.js";
import {
  createStrategySchema,
  followStrategySchema,
  strategyParamsSchema,
  userParamsSchema
} from "../domain/validators.js";
import {
  createStrategy,
  followStrategy,
  listStrategies,
  listUserFollows
} from "../services/strategyService.js";
import {
  parseIdempotencyKey,
  runIdempotentMutation
} from "../services/idempotencyService.js";

export const registerStrategyRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/strategies", async () => {
    return {
      data: await listStrategies(),
      error: null
    };
  });

  app.post("/api/strategies", async (request, reply) => {
    const parsed = createStrategySchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? "Invalid strategy payload.", 400);
    }

    const idempotencyKey = parseIdempotencyKey(request.headers["idempotency-key"]);
    const result = await runIdempotentMutation({
      scope: "strategies.create",
      actorId: parsed.data.creatorHandle,
      idempotencyKey,
      requestBody: parsed.data,
      execute: async () => ({
        statusCode: 201,
        body: {
          data: await createStrategy(parsed.data),
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

  app.post("/api/strategies/:strategyId/follows", async (request, reply) => {
    const parsedParams = strategyParamsSchema.safeParse(request.params);
    const parsedBody = followStrategySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      const validationMessage = !parsedParams.success
        ? parsedParams.error.errors[0]?.message
        : !parsedBody.success
          ? parsedBody.error.errors[0]?.message
          : "Invalid follow payload.";

      throw new AppError(validationMessage ?? "Invalid follow payload.", 400);
    }

    const idempotencyKey = parseIdempotencyKey(request.headers["idempotency-key"]);
    const result = await runIdempotentMutation({
      scope: `strategies.follow.${parsedParams.data.strategyId}`,
      actorId: parsedBody.data.userId,
      idempotencyKey,
      requestBody: {
        strategyId: parsedParams.data.strategyId,
        ...parsedBody.data
      },
      execute: async () => ({
        statusCode: 201,
        body: {
          data: await followStrategy(parsedParams.data.strategyId, parsedBody.data),
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

  app.get("/api/users/:userId/follows", async (request) => {
    const parsedParams = userParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError(parsedParams.error.errors[0]?.message ?? "Invalid user params.", 400);
    }

    return {
      data: await listUserFollows(parsedParams.data.userId),
      error: null
    };
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        data: null,
        error: {
          message: error.message
        }
      });
      return;
    }

    if (error instanceof z.ZodError) {
      reply.status(400).send({
        data: null,
        error: {
          message: error.errors[0]?.message ?? "Validation error."
        }
      });
      return;
    }

    request.log.error(error);
    reply.status(500).send({
      data: null,
      error: {
        message: "Internal server error."
      }
    });
  });
};

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

    const strategy = await createStrategy(parsed.data);

    reply.status(201);
    return {
      data: strategy,
      error: null
    };
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

    const result = await followStrategy(parsedParams.data.strategyId, parsedBody.data);

    reply.status(201);
    return {
      data: result,
      error: null
    };
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

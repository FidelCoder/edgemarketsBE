import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import {
  createOrderRecordSchema,
  creatorParamsSchema,
  orderQuerySchema,
  strategyParamsSchema
} from "../domain/validators.js";
import { getCurrentSession } from "../services/authService.js";
import {
  getCreatorPerformance,
  listStrategyOrderHistory,
  listUserOrderRecords,
  upsertOrderRecord
} from "../services/orderService.js";

export const registerOrderRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/orders", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = orderQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid order query.", 400);
    }

    return {
      data: await listUserOrderRecords(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.post("/api/orders", async (request, reply) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedBody = createOrderRecordSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid order payload.", 400);
    }

    if (parsedBody.data.userId !== session.userId) {
      throw new AppError("Order user does not match the active session.", 403);
    }

    if (parsedBody.data.walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()) {
      throw new AppError("Order wallet does not match the active session.", 403);
    }

    const record = await upsertOrderRecord(parsedBody.data);
    reply.status(201);

    return {
      data: record,
      error: null
    };
  });

  app.get("/api/strategies/:strategyId/history", async (request) => {
    const parsedParams = strategyParamsSchema.safeParse(request.params);
    const parsedQuery = orderQuerySchema.safeParse(request.query);

    if (!parsedParams.success) {
      throw new AppError(parsedParams.error.errors[0]?.message ?? "Invalid strategy params.", 400);
    }

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid strategy history query.", 400);
    }

    return {
      data: await listStrategyOrderHistory(parsedParams.data.strategyId, parsedQuery.data.limit),
      error: null
    };
  });

  app.get("/api/creators/:creatorHandle/performance", async (request) => {
    const parsedParams = creatorParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError(parsedParams.error.errors[0]?.message ?? "Invalid creator params.", 400);
    }

    return {
      data: await getCreatorPerformance(parsedParams.data.creatorHandle),
      error: null
    };
  });
};

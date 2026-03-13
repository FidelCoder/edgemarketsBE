import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { agentReviewQuerySchema, agentWorkerRunSchema, upsertAgentSessionSchema } from "../domain/validators.js";
import { getCurrentSession } from "../services/authService.js";
import { exportUserAgentReviewsCsv, getUserAgentReviewSummary, listUserAgentReviews } from "../services/agentReviewService.js";
import { getAgentSessionForAuthSession, upsertAgentSession } from "../services/agentSessionService.js";
import { processAgentSessionsTick } from "../services/agentWorkerService.js";

export const registerAgentRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/agent/session", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);

    return {
      data: await getAgentSessionForAuthSession(session),
      error: null
    };
  });

  app.put("/api/agent/session", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedBody = upsertAgentSessionSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid agent session payload.", 400);
    }

    return {
      data: await upsertAgentSession(session, parsedBody.data),
      error: null
    };
  });

  app.get("/api/agent/reviews", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = agentReviewQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid agent review query.", 400);
    }

    return {
      data: await listUserAgentReviews(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.get("/api/agent/reviews/summary", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = agentReviewQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid agent review summary query.", 400);
    }

    return {
      data: await getUserAgentReviewSummary(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.get("/api/agent/reviews/export", async (request, reply) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = agentReviewQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid agent review export query.", 400);
    }

    const csv = await exportUserAgentReviewsCsv(session.userId, parsedQuery.data);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="edge-agent-reviews.csv"');
    return reply.send(csv);
  });

  app.post("/api/agent/worker/run-once", async (request) => {
    const parsedBody = agentWorkerRunSchema.safeParse(request.body ?? {});

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid agent worker payload.", 400);
    }

    return {
      data: await processAgentSessionsTick(parsedBody.data.maxSessions ?? 20),
      error: null
    };
  });
};

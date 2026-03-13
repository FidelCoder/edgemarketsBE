import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { agentWorkerRunSchema, upsertAgentSessionSchema } from "../domain/validators.js";
import { getCurrentSession } from "../services/authService.js";
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

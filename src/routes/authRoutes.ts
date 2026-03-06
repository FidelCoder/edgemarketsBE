import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { consumeHandoffSchema, createAuthSessionSchema } from "../domain/validators.js";
import {
  consumeSessionHandoff,
  createSessionHandoff,
  getCurrentSession,
  startAuthSession
} from "../services/authService.js";

export const registerAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post("/api/auth/sessions", async (request, reply) => {
    const parsedBody = createAuthSessionSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid auth session payload.", 400);
    }

    const session = await startAuthSession(parsedBody.data);
    reply.status(201);

    return {
      data: session,
      error: null
    };
  });

  app.get("/api/auth/sessions/me", async (request) => {
    return {
      data: await getCurrentSession(request.headers.authorization),
      error: null
    };
  });

  app.post("/api/auth/handoff/request", async (request) => {
    return {
      data: await createSessionHandoff(request.headers.authorization),
      error: null
    };
  });

  app.post("/api/auth/handoff/consume", async (request, reply) => {
    const parsedBody = consumeHandoffSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid handoff payload.", 400);
    }

    const session = await consumeSessionHandoff(parsedBody.data.handoffCode);
    reply.status(201);

    return {
      data: session,
      error: null
    };
  });
};

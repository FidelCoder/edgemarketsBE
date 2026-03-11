import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import {
  consumeHandoffSchema,
  createAuthChallengeSchema,
  verifyAuthChallengeSchema
} from "../domain/validators.js";
import {
  consumeSessionHandoff,
  createAuthChallenge,
  createSessionHandoff,
  getCurrentSession,
  verifyAuthChallenge
} from "../services/authService.js";

export const registerAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post("/api/auth/challenge", async (request, reply) => {
    const parsedBody = createAuthChallengeSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid auth challenge payload.", 400);
    }

    const challenge = await createAuthChallenge({
      walletAddress: parsedBody.data.walletAddress,
      client: parsedBody.data.client ?? "web",
      origin: request.headers.origin
    });
    reply.status(201);

    return {
      data: challenge,
      error: null
    };
  });

  app.post("/api/auth/verify", async (request, reply) => {
    const parsedBody = verifyAuthChallengeSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError(parsedBody.error.errors[0]?.message ?? "Invalid auth verify payload.", 400);
    }

    const session = await verifyAuthChallenge({
      challengeId: parsedBody.data.challengeId,
      walletAddress: parsedBody.data.walletAddress,
      signature: parsedBody.data.signature,
      client: parsedBody.data.client ?? "web"
    });
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

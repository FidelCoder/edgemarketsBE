import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  AuthSession,
  CreateAuthSessionApiInput,
  CreateSessionHandoffInput,
  SessionHandoff
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";

interface AuthHandoffResponse {
  handoffCode: string;
  expiresAt: string;
}

const isDuplicateError = (error: unknown): boolean => {
  return (error as { code?: number } | null)?.code === 11000;
};

const createHandoffCode = (): string => {
  return `EM-${randomBytes(4).toString("hex").toUpperCase()}`;
};

const getHandoffExpiryIso = (): string => {
  const expiresAt = Date.now() + env.authHandoffTtlSeconds * 1000;
  return new Date(expiresAt).toISOString();
};

const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new AppError("Missing Authorization header.", 401);
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError("Authorization header must be Bearer <token>.", 401);
  }

  return token.trim();
};

const createUniqueSessionHandoff = async (
  input: Omit<CreateSessionHandoffInput, "code">
): Promise<SessionHandoff> => {
  const store = getStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await store.createSessionHandoff({
        ...input,
        code: createHandoffCode()
      });
    } catch (error) {
      if (!isDuplicateError(error)) {
        throw error;
      }
    }
  }

  throw new AppError("Could not generate unique handoff code.", 500);
};

export const startAuthSession = async (payload: CreateAuthSessionApiInput): Promise<AuthSession> => {
  const store = getStore();
  const created = await store.createAuthSession({
    walletAddress: payload.walletAddress.toLowerCase(),
    client: payload.client ?? "web"
  });

  await createAuditLog({
    action: "session.created",
    actorType: "user",
    actorId: created.userId,
    entityType: "session",
    entityId: created.id,
    metadata: {
      client: created.client,
      walletAddress: created.walletAddress
    }
  });

  return created;
};

export const getCurrentSession = async (authorizationHeader: string | undefined): Promise<AuthSession> => {
  const store = getStore();
  const token = extractBearerToken(authorizationHeader);
  const session = await store.getAuthSessionByToken(token);

  if (!session) {
    throw new AppError("Session not found.", 401);
  }

  return (await store.updateAuthSessionLastActive(token)) ?? session;
};

export const createSessionHandoff = async (
  authorizationHeader: string | undefined
): Promise<AuthHandoffResponse> => {
  const sourceSession = await getCurrentSession(authorizationHeader);

  if (sourceSession.client !== "web") {
    throw new AppError("Only web sessions can generate extension handoff codes.", 403);
  }

  const handoff = await createUniqueSessionHandoff({
    sourceSessionId: sourceSession.id,
    walletAddress: sourceSession.walletAddress,
    userId: sourceSession.userId,
    expiresAt: getHandoffExpiryIso()
  });

  await createAuditLog({
    action: "handoff.created",
    actorType: "user",
    actorId: sourceSession.userId,
    entityType: "handoff",
    entityId: handoff.id,
    metadata: {
      sourceSessionId: sourceSession.id,
      expiresAt: handoff.expiresAt
    }
  });

  return {
    handoffCode: handoff.code,
    expiresAt: handoff.expiresAt
  };
};

export const consumeSessionHandoff = async (handoffCode: string): Promise<AuthSession> => {
  const store = getStore();
  const consumedAtIso = new Date().toISOString();
  const handoff = await store.consumeSessionHandoff(handoffCode, consumedAtIso);

  if (!handoff) {
    throw new AppError("Handoff code is invalid, expired, or already used.", 404);
  }

  const extensionSession = await store.createAuthSession({
    walletAddress: handoff.walletAddress,
    client: "extension",
    linkedSessionId: handoff.sourceSessionId
  });

  await createAuditLog({
    action: "handoff.consumed",
    actorType: "system",
    actorId: "auth-service",
    entityType: "handoff",
    entityId: handoff.id,
    metadata: {
      extensionSessionId: extensionSession.id,
      consumedAt: consumedAtIso
    }
  });

  await createAuditLog({
    action: "session.created",
    actorType: "user",
    actorId: extensionSession.userId,
    entityType: "session",
    entityId: extensionSession.id,
    metadata: {
      client: extensionSession.client,
      linkedSessionId: extensionSession.linkedSessionId
    }
  });

  return extensionSession;
};

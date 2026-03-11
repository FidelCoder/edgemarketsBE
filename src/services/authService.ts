import { randomBytes } from "node:crypto";
import { utils as ethersUtils } from "ethers";
import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  AuthChallenge,
  AuthSession,
  CreateAuthChallengeInput,
  CreateAuthSessionInput,
  CreateSessionHandoffInput,
  SessionHandoff,
  VerifyAuthChallengeInput
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

const challenges = new Map<string, AuthChallenge>();

const nowIso = (): string => new Date().toISOString();

const createHandoffCode = (): string => {
  return `EM-${randomBytes(4).toString("hex").toUpperCase()}`;
};

const createNonce = (): string => {
  return randomBytes(16).toString("hex");
};

const getHandoffExpiryIso = (): string => {
  const expiresAt = Date.now() + env.authHandoffTtlSeconds * 1000;
  return new Date(expiresAt).toISOString();
};

const getChallengeExpiryIso = (): string => {
  const expiresAt = Date.now() + env.authChallengeTtlSeconds * 1000;
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

const buildChallengeMessage = (challenge: AuthChallenge, origin?: string): string => {
  const resourceOrigin = origin?.trim() || `https://${env.authMessageDomain}`;

  return [
    `EdgeMarkets wants you to sign in with your wallet:`,
    challenge.walletAddress,
    "",
    "Sign this message to authenticate and enable live Polymarket trading from EdgeMarkets.",
    `URI: ${resourceOrigin}`,
    "Version: 1",
    `Chain ID: ${env.polymarketChainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expiration Time: ${challenge.expiresAt}`,
    `Request ID: ${challenge.id}`
  ].join("\n");
};

const pruneExpiredChallenges = (): void => {
  const currentIso = nowIso();

  for (const [challengeId, challenge] of challenges.entries()) {
    if (challenge.expiresAt <= currentIso || challenge.consumedAt) {
      challenges.delete(challengeId);
    }
  }
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

const startAuthSession = async (payload: CreateAuthSessionInput): Promise<AuthSession> => {
  const store = getStore();
  const created = await store.createAuthSession({
    walletAddress: payload.walletAddress.toLowerCase(),
    client: payload.client,
    linkedSessionId: payload.linkedSessionId
  });

  await createAuditLog({
    action: "session.created",
    actorType: "user",
    actorId: created.userId,
    entityType: "session",
    entityId: created.id,
    metadata: {
      client: created.client,
      walletAddress: created.walletAddress,
      linkedSessionId: created.linkedSessionId
    }
  });

  return created;
};

export const createAuthChallenge = async (payload: CreateAuthChallengeInput): Promise<AuthChallenge> => {
  pruneExpiredChallenges();

  const challenge: AuthChallenge = {
    id: `chal_${randomBytes(8).toString("hex")}`,
    walletAddress: payload.walletAddress.toLowerCase(),
    client: payload.client,
    nonce: createNonce(),
    message: "",
    issuedAt: nowIso(),
    expiresAt: getChallengeExpiryIso()
  };

  const message = buildChallengeMessage(challenge, payload.origin);
  const created: AuthChallenge = {
    ...challenge,
    message
  };

  challenges.set(created.id, created);
  return created;
};

export const verifyAuthChallenge = async (payload: VerifyAuthChallengeInput): Promise<AuthSession> => {
  pruneExpiredChallenges();

  const challenge = challenges.get(payload.challengeId);

  if (!challenge) {
    throw new AppError("Auth challenge not found or expired.", 404);
  }

  if (challenge.consumedAt) {
    throw new AppError("Auth challenge has already been used.", 409);
  }

  if (challenge.expiresAt <= nowIso()) {
    challenges.delete(challenge.id);
    throw new AppError("Auth challenge has expired.", 401);
  }

  if (challenge.walletAddress !== payload.walletAddress.toLowerCase()) {
    throw new AppError("Challenge wallet does not match verification wallet.", 400);
  }

  const recoveredAddress = ethersUtils.verifyMessage(challenge.message, payload.signature).toLowerCase();

  if (recoveredAddress !== challenge.walletAddress) {
    throw new AppError("Wallet signature could not be verified.", 401);
  }

  const consumedAt = nowIso();
  challenges.set(challenge.id, {
    ...challenge,
    consumedAt
  });

  await createAuditLog({
    action: "session.challenge_verified",
    actorType: "user",
    actorId: `wallet:${challenge.walletAddress}`,
    entityType: "session",
    entityId: challenge.id,
    metadata: {
      client: payload.client,
      recoveredAddress,
      consumedAt
    }
  });

  return startAuthSession({
    walletAddress: challenge.walletAddress,
    client: payload.client
  });
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
  const consumedAtIso = nowIso();
  const handoff = await store.consumeSessionHandoff(handoffCode, consumedAtIso);

  if (!handoff) {
    throw new AppError("Handoff code is invalid, expired, or already used.", 404);
  }

  const extensionSession = await startAuthSession({
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

  return extensionSession;
};

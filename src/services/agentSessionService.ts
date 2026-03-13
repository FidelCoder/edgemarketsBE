import { AppError } from "../domain/errors.js";
import { AgentSession, AuthSession, UpsertAgentSessionInput } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";

const getAgentAuditAction = (existing: AgentSession | undefined, next: UpsertAgentSessionInput): string => {
  if (!existing) {
    return "agent_session.created";
  }

  if (next.status === "halted" && existing.status !== "halted") {
    return "agent_session.halted";
  }

  if (next.status === "running" && existing.status !== "running") {
    return "agent_session.started";
  }

  return "agent_session.updated";
};

export const getAgentSessionForUser = async (userId: string): Promise<AgentSession | null> => {
  const store = getStore();
  return (await store.getAgentSessionByUserId(userId)) ?? null;
};

export const getAgentSessionForAuthSession = async (session: AuthSession): Promise<AgentSession | null> => {
  return getAgentSessionForUser(session.userId);
};

export const upsertAgentSession = async (
  session: AuthSession,
  payload: Omit<UpsertAgentSessionInput, "userId" | "walletAddress">
): Promise<AgentSession> => {
  if (payload.status === "halted" && !payload.haltReason?.trim()) {
    throw new AppError("A halted agent session must include a halt reason.", 400);
  }

  const store = getStore();
  const existing = await store.getAgentSessionByUserId(session.userId);
  const saved = await store.upsertAgentSession({
    ...payload,
    userId: session.userId,
    walletAddress: session.walletAddress
  });

  await createAuditLog({
    action: getAgentAuditAction(existing, saved),
    actorType: "user",
    actorId: session.userId,
    entityType: "session",
    entityId: saved.id,
    metadata: {
      status: saved.status,
      provider: saved.plan.provider,
      model: saved.plan.model,
      legs: saved.plan.legs.length,
      executedOrders: saved.executedOrderIds.length,
      executedMarkets: saved.executedMarketIds.length,
      haltReason: saved.haltReason ?? null,
      drawdownPct: saved.lastEvaluation?.drawdownPct ?? null,
      dayPnlUsd: saved.lastEvaluation?.dayPnlUsd ?? null
    }
  });

  return saved;
};

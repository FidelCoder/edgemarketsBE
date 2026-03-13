import { AppError } from "../domain/errors.js";
import { AgentEvaluationSnapshot, AgentReviewDecision, AgentSession, Market, OrderRecord } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";
import { listMarkets } from "./polymarketService.js";
import { getUserPnlLedgerSummary } from "./pnlLedgerService.js";

interface AgentWorkerTickSummary {
  reviewed: number;
  halted: number;
  active: number;
  skipped: number;
}

const nowIso = (): string => new Date().toISOString();

const isBuyOrder = (order: OrderRecord): boolean => order.side === "BUY";

const isExposedOrder = (order: OrderRecord): boolean => {
  if (!isBuyOrder(order) || order.source !== "agent") {
    return false;
  }

  if (order.status === "failed" || order.tradeStatus === "FAILED") {
    return false;
  }

  return (
    order.status === "filled" ||
    order.tradeStatus === "MATCHED" ||
    order.tradeStatus === "MINED" ||
    order.tradeStatus === "CONFIRMED"
  );
};

const getMarketPriceForOrder = (order: OrderRecord, market: Market): number => {
  return order.outcome === "YES" ? market.yesPrice : market.noPrice;
};

const countConsecutiveLosses = (orders: OrderRecord[], marketMap: Map<string, Market>): number => {
  let streak = 0;

  for (const order of [...orders].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const market = marketMap.get(order.marketId);

    if (!market || !isExposedOrder(order)) {
      continue;
    }

    const pnlUsd = order.size * getMarketPriceForOrder(order, market) - order.amountUsd;

    if (pnlUsd < 0) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
};

const evaluateAgentSession = (
  session: AgentSession,
  orders: OrderRecord[],
  markets: Market[],
  realizedPnlUsd: number
): AgentEvaluationSnapshot => {
  const marketMap = new Map(markets.map((market) => [market.id, market]));
  const relevantOrders = orders.filter((order) => {
    return isExposedOrder(order) && session.executedOrderIds.includes(order.id);
  });

  const markToMarketPnlUsd = relevantOrders.reduce((sum, order) => {
    const market = marketMap.get(order.marketId);

    if (!market) {
      return sum;
    }

    const currentValue = order.size * getMarketPriceForOrder(order, market);
    return sum + (currentValue - order.amountUsd);
  }, 0);

  const today = new Date().toISOString().slice(0, 10);
  const dayPnlUsd = relevantOrders.reduce((sum, order) => {
    if (!order.updatedAt.startsWith(today)) {
      return sum;
    }

    const market = marketMap.get(order.marketId);

    if (!market) {
      return sum;
    }

    const currentValue = order.size * getMarketPriceForOrder(order, market);
    return sum + (currentValue - order.amountUsd);
  }, 0);

  const deployedUsd = relevantOrders.reduce((sum, order) => sum + order.amountUsd, 0);
  const drawdownPct = Math.max(0, (-markToMarketPnlUsd / Math.max(session.plan.bankrollUsd, 1)) * 100);
  const consecutiveLosses = countConsecutiveLosses(relevantOrders, marketMap);
  const haltByDrawdown = drawdownPct >= session.plan.haltRules.maxDrawdownPct;
  const haltByDayLoss = -dayPnlUsd >= session.plan.haltRules.dailyLossLimitUsd;
  const haltByLossStreak = consecutiveLosses >= session.plan.haltRules.maxConsecutiveLosses;
  const haltReason = haltByDrawdown
    ? `Drawdown limit hit (${drawdownPct.toFixed(1)}% >= ${session.plan.haltRules.maxDrawdownPct}%).`
    : haltByDayLoss
      ? `Daily loss limit hit ($${(-dayPnlUsd).toFixed(2)} >= $${session.plan.haltRules.dailyLossLimitUsd.toFixed(2)}).`
      : haltByLossStreak
        ? `Loss streak halt hit (${consecutiveLosses} >= ${session.plan.haltRules.maxConsecutiveLosses}).`
        : undefined;

  return {
    deployedUsd: Number(deployedUsd.toFixed(2)),
    markToMarketPnlUsd: Number(markToMarketPnlUsd.toFixed(2)),
    realizedPnlUsd: Number(realizedPnlUsd.toFixed(2)),
    dayPnlUsd: Number(dayPnlUsd.toFixed(2)),
    drawdownPct: Number(drawdownPct.toFixed(2)),
    consecutiveLosses,
    haltTriggered: Boolean(haltReason),
    haltReason,
    executedOrders: relevantOrders.length,
    effectiveBankrollUsd: Number((session.plan.bankrollUsd + realizedPnlUsd + markToMarketPnlUsd).toFixed(2)),
    compoundingBankrollUsd: Number((session.plan.bankrollUsd + realizedPnlUsd).toFixed(2))
  };
};

const isReviewDue = (session: AgentSession): boolean => {
  if (!session.lastReviewedAt) {
    return true;
  }

  const lastReviewedAt = Date.parse(session.lastReviewedAt);

  if (Number.isNaN(lastReviewedAt)) {
    return true;
  }

  return Date.now() - lastReviewedAt >= session.plan.rebalanceIntervalHours * 60 * 60 * 1000;
};

export const processAgentSessionsTick = async (maxSessions = 20): Promise<AgentWorkerTickSummary> => {
  const store = getStore();
  const sessions = await store.listAgentSessions("running");

  if (sessions.length === 0) {
    return {
      reviewed: 0,
      halted: 0,
      active: 0,
      skipped: 0
    };
  }

  const markets = await listMarkets();

  if (markets.length === 0) {
    throw new AppError("No live markets available for agent session review.", 503);
  }

  const summary: AgentWorkerTickSummary = {
    reviewed: 0,
    halted: 0,
    active: 0,
    skipped: 0
  };

  for (const session of sessions.slice(0, maxSessions)) {
    if (!isReviewDue(session)) {
      summary.skipped += 1;
      continue;
    }

    const orders = await store.listOrderRecords({ userId: session.userId, limit: 500 });
    const pnlSummary = await getUserPnlLedgerSummary(session.userId);
    const evaluation = evaluateAgentSession(session, orders, markets, pnlSummary.totalRealizedPnlUsd);
    const nextStatus = evaluation.haltTriggered ? "halted" : "running";
    const decision: AgentReviewDecision = evaluation.haltTriggered ? "halt" : "hold";
    const reviewedAt = nowIso();

    const savedSession = await store.upsertAgentSession({
      userId: session.userId,
      walletAddress: session.walletAddress,
      status: nextStatus,
      plan: session.plan,
      executedOrderIds: session.executedOrderIds,
      executedMarketIds: session.executedMarketIds,
      haltReason: evaluation.haltReason,
      lastEvaluation: evaluation,
      lastReviewedAt: reviewedAt
    });

    await store.createAgentReview({
      userId: session.userId,
      sessionId: savedSession.id,
      source: "worker",
      decision,
      reason: evaluation.haltReason,
      reviewedAt,
      evaluation,
      planBankrollUsd: session.plan.bankrollUsd,
      executedMarketCount: session.executedMarketIds.length,
      executedOrderCount: session.executedOrderIds.length
    });

    summary.reviewed += 1;

    if (evaluation.haltTriggered) {
      summary.halted += 1;

      await createAuditLog({
        action: "agent_session.halted",
        actorType: "worker",
        actorId: "agent_worker",
        entityType: "session",
        entityId: session.id,
        metadata: {
          userId: session.userId,
          haltReason: evaluation.haltReason,
          drawdownPct: evaluation.drawdownPct,
          dayPnlUsd: evaluation.dayPnlUsd,
          consecutiveLosses: evaluation.consecutiveLosses,
          executedOrders: evaluation.executedOrders
        }
      });

      continue;
    }

    summary.active += 1;
  }

  return summary;
};

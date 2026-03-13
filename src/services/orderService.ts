import { AppError } from "../domain/errors.js";
import {
  CreateOrderRecordInput,
  CreatorPerformanceSummary,
  Market,
  OrderRecord,
  OrderRecordQuery,
  StrategyWithMarket
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";
import { getMarketById } from "./polymarketService.js";
import { syncUserPnlLedger } from "./pnlLedgerService.js";
import { getStrategyWithMarket } from "./strategyService.js";

const sortByUpdatedAtDesc = <T extends { updatedAt: string }>(items: T[]): T[] => {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const withLimit = <T>(items: T[], limit?: number): T[] => {
  return items.slice(0, limit ?? 100);
};

const validateOrderContext = async (
  payload: CreateOrderRecordInput
): Promise<{ market: Market; strategy?: StrategyWithMarket }> => {
  if (payload.source === "agent") {
    const market = await getMarketById(payload.marketId);

    if (!market) {
      throw new AppError("Order market does not exist.", 400);
    }

    return { market };
  }

  const strategy = await getStrategyWithMarket(payload.strategyId);

  if (strategy.marketId !== payload.marketId) {
    throw new AppError("Order market does not match strategy market.", 400);
  }

  if (strategy.creatorHandle !== payload.creatorHandle) {
    throw new AppError("Order creator does not match strategy creator.", 400);
  }

  return {
    market: strategy.market,
    strategy
  };
};

export const upsertOrderRecord = async (payload: CreateOrderRecordInput): Promise<OrderRecord> => {
  const store = getStore();
  const existing = await store.getOrderRecordByPolymarketOrderId(payload.polymarketOrderId);
  const context = await validateOrderContext(payload);
  const record = await store.upsertOrderRecord(payload);

  if (!existing) {
    await createAuditLog({
      action: "order.created",
      actorType: "user",
      actorId: payload.userId,
      entityType: "order",
      entityId: record.id,
      metadata: {
        polymarketOrderId: payload.polymarketOrderId,
        source: payload.source,
        strategyId: payload.strategyId,
        marketId: payload.marketId,
        outcome: payload.outcome,
        side: payload.side,
        status: payload.status,
        tradeStatus: payload.tradeStatus,
        amountUsd: payload.amountUsd,
        strategyName: context.strategy?.name ?? "AI agent order"
      }
    });

    return record;
  }

  if (existing.status !== record.status || existing.tradeStatus !== record.tradeStatus) {
    await createAuditLog({
      action: "order.updated",
      actorType: "user",
      actorId: payload.userId,
      entityType: "order",
      entityId: record.id,
      metadata: {
        polymarketOrderId: payload.polymarketOrderId,
        source: payload.source,
        previousStatus: existing.status,
        nextStatus: record.status,
        previousTradeStatus: existing.tradeStatus,
        nextTradeStatus: record.tradeStatus,
        transactionHashes: record.transactionHashes,
        errorMessage: record.errorMessage
      }
    });
  }

  if (record.status === "filled") {
    await syncUserPnlLedger(payload.userId);
  }

  return record;
};

export const listUserOrderRecords = async (
  userId: string,
  query?: OrderRecordQuery
): Promise<OrderRecord[]> => {
  const store = getStore();
  const orders = await store.listOrderRecords(query);

  return withLimit(
    sortByUpdatedAtDesc(orders.filter((record) => record.userId === userId)),
    query?.limit
  );
};

export const listStrategyOrderHistory = async (
  strategyId: string,
  limit?: number
): Promise<OrderRecord[]> => {
  const store = getStore();
  return withLimit(await store.listOrderRecords({ strategyId, limit }), limit);
};

export const getCreatorPerformance = async (
  creatorHandle: string
): Promise<CreatorPerformanceSummary> => {
  const store = getStore();
  const [strategies, orders] = await Promise.all([
    store.listStrategies(),
    store.listOrderRecords({ creatorHandle, limit: 500 })
  ]);

  const creatorStrategies = strategies.filter((strategy) => strategy.creatorHandle === creatorHandle);

  if (creatorStrategies.length === 0) {
    throw new AppError("Creator not found.", 404);
  }

  const totalFollowers = creatorStrategies.reduce((sum, strategy) => sum + strategy.followerCount, 0);
  const totalVolumeUsd = orders.reduce((sum, order) => sum + order.amountUsd, 0);
  const filledOrders = orders.filter((order) => order.status === "filled").length;
  const openOrders = orders.filter((order) => order.status === "open" || order.status === "submitted").length;
  const failedOrders = orders.filter((order) => order.status === "failed").length;
  const retriedOrders = orders.filter((order) => order.status === "retried").length;
  const latestOrderAt = sortByUpdatedAtDesc(orders)[0]?.updatedAt;

  return {
    creatorHandle,
    strategyCount: creatorStrategies.length,
    totalFollowers,
    totalOrders: orders.length,
    openOrders,
    filledOrders,
    failedOrders,
    retriedOrders,
    totalVolumeUsd: Number(totalVolumeUsd.toFixed(2)),
    fillRate: orders.length > 0 ? Number((filledOrders / orders.length).toFixed(4)) : 0,
    latestOrderAt
  };
};

import {
  Market,
  OrderRecord,
  PnlLedgerEntry,
  PnlLedgerRollupItem,
  PnlLedgerRollups,
  PnlLedgerSummary,
  Strategy
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { listMarkets } from "./polymarketService.js";

interface OpenLot {
  orderId: string;
  marketId: string;
  outcome: "YES" | "NO";
  source: "strategy" | "agent";
  remainingSize: number;
  price: number;
  amountUsd: number;
  openedAt: string;
}

const isFilled = (status: string): boolean => status === "filled";

const toEventTime = (value: { filledAt?: string; updatedAt: string; createdAt: string }): string => {
  return value.filledAt ?? value.updatedAt ?? value.createdAt;
};

const sortByEventTimeAsc = <T extends { filledAt?: string; updatedAt: string; createdAt: string }>(items: T[]): T[] => {
  return [...items].sort((left, right) => toEventTime(left).localeCompare(toEventTime(right)));
};

const round = (value: number): number => Number(value.toFixed(2));

const buildEntryKey = (userId: string, closingOrderId: string, openingOrderId: string): string => {
  return `pnl:${userId}:${closingOrderId}:${openingOrderId}`;
};

const buildSummary = (userId: string, entries: PnlLedgerEntry[]): PnlLedgerSummary => {
  const winningTrades = entries.filter((entry) => entry.realizedPnlUsd > 0).length;
  const losingTrades = entries.filter((entry) => entry.realizedPnlUsd < 0).length;
  const flatTrades = entries.filter((entry) => entry.realizedPnlUsd === 0).length;
  const totalCostBasisUsd = round(entries.reduce((sum, entry) => sum + entry.costBasisUsd, 0));
  const totalProceedsUsd = round(entries.reduce((sum, entry) => sum + entry.proceedsUsd, 0));
  const totalRealizedPnlUsd = round(entries.reduce((sum, entry) => sum + entry.realizedPnlUsd, 0));

  return {
    userId,
    closedTrades: entries.length,
    winningTrades,
    losingTrades,
    flatTrades,
    totalCostBasisUsd,
    totalProceedsUsd,
    totalRealizedPnlUsd,
    winRate: entries.length > 0 ? Number((winningTrades / entries.length).toFixed(4)) : 0,
    latestClosedAt: entries[0]?.closedAt
  };
};

interface RollupAccumulator {
  key: string;
  label: string;
  subtitle?: string;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  flatTrades: number;
  totalRealizedPnlUsd: number;
}

const sortRollups = (items: RollupAccumulator[]): PnlLedgerRollupItem[] => {
  return [...items]
    .sort((left, right) => {
      const pnlDelta = Math.abs(right.totalRealizedPnlUsd) - Math.abs(left.totalRealizedPnlUsd);

      if (pnlDelta !== 0) {
        return pnlDelta;
      }

      return right.closedTrades - left.closedTrades;
    })
    .map((item) => ({
      key: item.key,
      label: item.label,
      subtitle: item.subtitle,
      closedTrades: item.closedTrades,
      winningTrades: item.winningTrades,
      losingTrades: item.losingTrades,
      flatTrades: item.flatTrades,
      totalRealizedPnlUsd: round(item.totalRealizedPnlUsd),
      winRate: item.closedTrades > 0 ? Number((item.winningTrades / item.closedTrades).toFixed(4)) : 0
    }));
};

const accumulateRollup = (
  accumulator: Map<string, RollupAccumulator>,
  entry: PnlLedgerEntry,
  key: string,
  label: string,
  subtitle?: string
): void => {
  const current = accumulator.get(key) ?? {
    key,
    label,
    subtitle,
    closedTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    flatTrades: 0,
    totalRealizedPnlUsd: 0
  };

  current.closedTrades += 1;
  current.totalRealizedPnlUsd = round(current.totalRealizedPnlUsd + entry.realizedPnlUsd);

  if (entry.realizedPnlUsd > 0) {
    current.winningTrades += 1;
  } else if (entry.realizedPnlUsd < 0) {
    current.losingTrades += 1;
  } else {
    current.flatTrades += 1;
  }

  accumulator.set(key, current);
};

const buildRollups = (
  userId: string,
  entries: PnlLedgerEntry[],
  orders: OrderRecord[],
  markets: Market[],
  strategies: Strategy[],
  limit: number
): PnlLedgerRollups => {
  const marketMap = new Map(markets.map((market) => [market.id, market]));
  const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const byMarket = new Map<string, RollupAccumulator>();
  const byCategory = new Map<string, RollupAccumulator>();
  const byStrategy = new Map<string, RollupAccumulator>();

  for (const entry of entries) {
    const openingOrder = orderMap.get(entry.openingOrderId) ?? orderMap.get(entry.closingOrderId);
    const market = marketMap.get(entry.marketId);
    const strategyId = openingOrder?.strategyId ?? `market:${entry.marketId}`;
    const strategy = strategyMap.get(strategyId);
    const category = market?.category ?? "Uncategorized";

    accumulateRollup(
      byMarket,
      entry,
      entry.marketId,
      market?.question ?? entry.marketId,
      market ? `${market.category} · ${market.subcategory}` : entry.outcome
    );
    accumulateRollup(byCategory, entry, category, category);
    accumulateRollup(
      byStrategy,
      entry,
      strategyId,
      strategy?.name ?? strategyId,
      strategy?.creatorHandle ?? openingOrder?.creatorHandle ?? (entry.source === "agent" ? "Agent" : undefined)
    );
  }

  return {
    userId,
    byMarket: sortRollups([...byMarket.values()]).slice(0, limit),
    byCategory: sortRollups([...byCategory.values()]).slice(0, limit),
    byStrategy: sortRollups([...byStrategy.values()]).slice(0, limit)
  };
};

export const syncUserPnlLedger = async (userId: string): Promise<PnlLedgerSummary> => {
  const store = getStore();
  const orders = sortByEventTimeAsc(await store.listOrderRecords({ userId, limit: 5000 }));
  const openLots = new Map<string, OpenLot[]>();

  for (const order of orders) {
    if (!isFilled(order.status)) {
      continue;
    }

    const lotKey = `${order.marketId}:${order.outcome}`;

    if (order.side === "BUY") {
      const lots = openLots.get(lotKey) ?? [];
      lots.push({
        orderId: order.id,
        marketId: order.marketId,
        outcome: order.outcome,
        source: order.source,
        remainingSize: order.size,
        price: order.price,
        amountUsd: order.amountUsd,
        openedAt: toEventTime(order)
      });
      openLots.set(lotKey, lots);
      continue;
    }

    let remainingSellSize = order.size;
    const lots = openLots.get(lotKey) ?? [];

    for (const lot of lots) {
      if (remainingSellSize <= 0) {
        break;
      }

      if (lot.remainingSize <= 0) {
        continue;
      }

      const matchedSize = Math.min(lot.remainingSize, remainingSellSize);
      const costBasisUsd = round(lot.price * matchedSize);
      const proceedsUsd = round(order.price * matchedSize);
      const key = buildEntryKey(userId, order.id, lot.orderId);

      if (!(await store.getPnlLedgerEntryByKey(key))) {
        await store.createPnlLedgerEntry({
          key,
          userId,
          marketId: order.marketId,
          outcome: order.outcome,
          source: order.source,
          openingOrderId: lot.orderId,
          closingOrderId: order.id,
          matchedSize: round(matchedSize),
          openingPrice: lot.price,
          closingPrice: order.price,
          costBasisUsd,
          proceedsUsd,
          realizedPnlUsd: round(proceedsUsd - costBasisUsd),
          openedAt: lot.openedAt,
          closedAt: toEventTime(order)
        });
      }

      lot.remainingSize = round(lot.remainingSize - matchedSize);
      remainingSellSize = round(remainingSellSize - matchedSize);
    }

    openLots.set(
      lotKey,
      lots.filter((lot) => lot.remainingSize > 0)
    );
  }

  const entries = await store.listPnlLedgerEntries({ userId, limit: 5000 });
  return buildSummary(userId, entries);
};

export const listUserPnlLedgerEntries = async (userId: string, limit = 20): Promise<PnlLedgerEntry[]> => {
  const store = getStore();
  await syncUserPnlLedger(userId);
  return store.listPnlLedgerEntries({ userId, limit });
};

export const getUserPnlLedgerSummary = async (userId: string): Promise<PnlLedgerSummary> => {
  const store = getStore();
  await syncUserPnlLedger(userId);
  const entries = await store.listPnlLedgerEntries({ userId, limit: 5000 });
  return buildSummary(userId, entries);
};

export const getUserPnlLedgerRollups = async (userId: string, limit = 5): Promise<PnlLedgerRollups> => {
  const store = getStore();
  await syncUserPnlLedger(userId);

  const [entries, orders, strategies, liveMarkets, storedMarkets] = await Promise.all([
    store.listPnlLedgerEntries({ userId, limit: 5000 }),
    store.listOrderRecords({ userId, limit: 5000 }),
    store.listStrategies(),
    listMarkets(),
    store.listMarkets()
  ]);
  const markets = liveMarkets.length > 0 ? liveMarkets : storedMarkets;

  return buildRollups(userId, entries, orders, markets, strategies, limit);
};

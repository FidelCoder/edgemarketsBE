import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadModules = async () => {
  vi.resetModules();
  const { buildApp } = await import("../../app.js");
  const { getCreatorPerformance } = await import("../orderService.js");
  const { getUserPnlLedgerRollups, syncUserPnlLedger } = await import("../pnlLedgerService.js");
  const { getStore } = await import("../../repositories/storeProvider.js");
  return { buildApp, getCreatorPerformance, getUserPnlLedgerRollups, syncUserPnlLedger, getStore };
};

describe("order service", () => {
  beforeEach(() => {
    process.env.STORE_PROVIDER = "memory";
    process.env.POLYMARKET_MARKET_SOURCE = "seed";
    process.env.TRIGGER_WORKER_ENABLED = "false";
  });

  afterEach(() => {
    delete process.env.STORE_PROVIDER;
    delete process.env.POLYMARKET_MARKET_SOURCE;
    delete process.env.TRIGGER_WORKER_ENABLED;
  });

  it("returns not found for creators with no strategies", async () => {
    const { buildApp, getCreatorPerformance } = await loadModules();
    const app = await buildApp();

    await expect(getCreatorPerformance("missing_creator")).rejects.toMatchObject({
      statusCode: 404
    });

    await app.close();
  });

  it("derives realized pnl entries from filled buy and sell orders", async () => {
    const { buildApp, syncUserPnlLedger, getStore } = await loadModules();
    const app = await buildApp();
    const store = getStore();
    const userId = "wallet:0xabc";

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-buy-1",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress: "0xabc0000000000000000000000000000000000000",
      funderAddress: "0xabc0000000000000000000000000000000000000",
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "buy_yes",
      side: "BUY",
      orderType: "GTC",
      price: 0.4,
      size: 100,
      amountUsd: 40,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T00:00:00.000Z").toISOString()
    });

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-sell-1",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress: "0xabc0000000000000000000000000000000000000",
      funderAddress: "0xabc0000000000000000000000000000000000000",
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "sell_yes",
      side: "SELL",
      orderType: "GTC",
      price: 0.55,
      size: 60,
      amountUsd: 33,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T01:00:00.000Z").toISOString()
    });

    const summary = await syncUserPnlLedger(userId);

    expect(summary.closedTrades).toBe(1);
    expect(summary.totalRealizedPnlUsd).toBe(9);

    const entries = await store.listPnlLedgerEntries({ userId, limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.matchedSize).toBe(60);
    expect(entries[0]?.costBasisUsd).toBe(24);
    expect(entries[0]?.proceedsUsd).toBe(33);

    await app.close();
  });

  it("aggregates realized pnl rollups by market, category, and strategy", async () => {
    const { buildApp, getStore, getUserPnlLedgerRollups } = await loadModules();
    const app = await buildApp();
    const store = getStore();
    const userId = "wallet:0xrollup";
    const walletAddress = "0xabc0000000000000000000000000000000000001";

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-rollup-buy-1",
      source: "strategy",
      strategyId: "strategy-btc-breakout",
      creatorHandle: "quantnairobi",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "buy_yes",
      side: "BUY",
      orderType: "GTC",
      price: 0.4,
      size: 50,
      amountUsd: 20,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T00:00:00.000Z").toISOString()
    });

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-rollup-sell-1",
      source: "strategy",
      strategyId: "strategy-btc-breakout",
      creatorHandle: "quantnairobi",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "sell_yes",
      side: "SELL",
      orderType: "GTC",
      price: 0.52,
      size: 50,
      amountUsd: 26,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T01:00:00.000Z").toISOString()
    });

    const rollups = await getUserPnlLedgerRollups(userId, { limit: 5 });

    expect(rollups.byMarket[0]).toMatchObject({
      key: "market-btc-100k-2026",
      label: "Will BTC touch $100k before Dec 31, 2026?",
      closedTrades: 1,
      totalRealizedPnlUsd: 6
    });
    expect(rollups.byCategory[0]).toMatchObject({
      key: "Crypto",
      label: "Crypto",
      closedTrades: 1,
      totalRealizedPnlUsd: 6
    });
    expect(rollups.byStrategy[0]).toMatchObject({
      key: "strategy-btc-breakout",
      label: "BTC Breakout Momentum",
      subtitle: "quantnairobi",
      closedTrades: 1,
      totalRealizedPnlUsd: 6
    });

    await app.close();
  });

  it("filters realized pnl analytics by date range", async () => {
    const { buildApp, getStore, getUserPnlLedgerRollups, syncUserPnlLedger } = await loadModules();
    const app = await buildApp();
    const store = getStore();
    const userId = "wallet:0xrange";
    const walletAddress = "0xabc0000000000000000000000000000000000002";

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-range-buy-old",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "buy_yes",
      side: "BUY",
      orderType: "GTC",
      price: 0.4,
      size: 50,
      amountUsd: 20,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-10T00:00:00.000Z").toISOString()
    });

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-range-sell-old",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "sell_yes",
      side: "SELL",
      orderType: "GTC",
      price: 0.44,
      size: 50,
      amountUsd: 22,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-10T01:00:00.000Z").toISOString()
    });

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-range-buy-new",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "buy_yes",
      side: "BUY",
      orderType: "GTC",
      price: 0.4,
      size: 50,
      amountUsd: 20,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T00:00:00.000Z").toISOString()
    });

    await store.upsertOrderRecord({
      polymarketOrderId: "pm-range-sell-new",
      source: "agent",
      strategyId: "agent:market-btc-100k-2026",
      creatorHandle: "edgeagent",
      marketId: "market-btc-100k-2026",
      userId,
      walletAddress,
      funderAddress: walletAddress,
      tokenId: "token-yes-1",
      outcome: "YES",
      action: "sell_yes",
      side: "SELL",
      orderType: "GTC",
      price: 0.52,
      size: 50,
      amountUsd: 26,
      status: "filled",
      tradeStatus: "CONFIRMED",
      filledAt: new Date("2026-03-13T01:00:00.000Z").toISOString()
    });

    await syncUserPnlLedger(userId);

    const filteredRollups = await getUserPnlLedgerRollups(userId, {
      limit: 5,
      dateFrom: "2026-03-13",
      dateTo: "2026-03-13"
    });

    expect(filteredRollups.byMarket[0]).toMatchObject({
      key: "market-btc-100k-2026",
      closedTrades: 1,
      totalRealizedPnlUsd: 6
    });

    await app.close();
  });
});

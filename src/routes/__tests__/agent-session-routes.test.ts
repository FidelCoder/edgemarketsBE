import { Wallet } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadApp = async () => {
  vi.resetModules();
  const { buildApp } = await import("../../app.js");
  return buildApp();
};

const baseAgentSessionPayload = {
  status: "draft",
  plan: {
    bankrollUsd: 1000,
    deployableUsd: 800,
    reserveUsd: 200,
    targetReturnPct: 18,
    timeHorizonDays: 21,
    rebalanceIntervalHours: 24,
    profitReinvestmentPct: 60,
    haltRules: {
      maxDrawdownPct: 8,
      dailyLossLimitUsd: 75,
      maxConsecutiveLosses: 2
    },
    summary: "Allocate cautiously across liquid markets and stop aggressively when the book turns against the portfolio.",
    compoundingNote: "Reinvest only a portion of gains after each review cycle and keep dry powder in reserve.",
    reviewPlan: ["Review positions every 24 hours.", "Rebalance only after checking open order status."],
    safeguards: ["Halt on max drawdown breach.", "Halt on daily loss breach.", "Avoid concentrated theme exposure."],
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    objective: "Compound carefully over three weeks.",
    legs: [
      {
        marketId: "market-btc-100k-2026",
        question: "Will Bitcoin hit $100k before January 1, 2027?",
        category: "Crypto",
        subcategory: "Bitcoin",
        action: "buy_yes",
        allocationUsd: 250,
        marketProbabilityYes: 0.41,
        fairProbabilityYes: 0.48,
        conviction: 0.64,
        rationale: "The market is slightly underpricing the medium-term upside scenario.",
        riskNote: "Macro tightening could compress upside sentiment quickly.",
        maxHoldingHours: 72,
        stopLossProbability: 0.35,
        takeProfitProbability: 0.58
      }
    ],
    sources: [],
    generatedAt: new Date("2026-03-13T00:00:00.000Z").toISOString()
  },
  executedOrderIds: [],
  executedMarketIds: [],
  lastEvaluation: {
    deployedUsd: 0,
    markToMarketPnlUsd: 0,
    realizedPnlUsd: 0,
    dayPnlUsd: 0,
    drawdownPct: 0,
    consecutiveLosses: 0,
    haltTriggered: false,
    executedOrders: 0,
    effectiveBankrollUsd: 1000,
    compoundingBankrollUsd: 1000
  }
};

describe("agent session routes", () => {
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

  it("persists and loads an authenticated agent session", async () => {
    const wallet = Wallet.createRandom();
    const app = await loadApp();

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        walletAddress: wallet.address,
        client: "web"
      }
    });
    const challenge = challengeResponse.json().data;
    const signature = await wallet.signMessage(challenge.message);

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: {
        challengeId: challenge.id,
        walletAddress: wallet.address,
        signature,
        client: "web"
      }
    });
    const session = verifyResponse.json().data;

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/agent/session",
      headers: {
        authorization: `Bearer ${session.token}`
      },
      payload: baseAgentSessionPayload
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().data.userId).toBe(session.userId);
    expect(saveResponse.json().data.plan.provider).toBe("anthropic");

    const loadResponse = await app.inject({
      method: "GET",
      url: "/api/agent/session",
      headers: {
        authorization: `Bearer ${session.token}`
      }
    });

    expect(loadResponse.statusCode).toBe(200);
    expect(loadResponse.json().data.status).toBe("draft");
    expect(loadResponse.json().data.plan.legs).toHaveLength(1);

    await app.close();
  });

  it("runs the agent worker review tick against persisted running sessions", async () => {
    const wallet = Wallet.createRandom();
    const app = await loadApp();

    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      payload: {
        walletAddress: wallet.address,
        client: "web"
      }
    });
    const challenge = challengeResponse.json().data;
    const signature = await wallet.signMessage(challenge.message);

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: {
        challengeId: challenge.id,
        walletAddress: wallet.address,
        signature,
        client: "web"
      }
    });
    const session = verifyResponse.json().data;

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/agent/session",
      headers: {
        authorization: `Bearer ${session.token}`
      },
      payload: {
        ...baseAgentSessionPayload,
        status: "running"
      }
    });

    expect(saveResponse.statusCode).toBe(200);

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/agent/worker/run-once",
      payload: {
        maxSessions: 5
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json().data.reviewed).toBe(1);

    const reviewsResponse = await app.inject({
      method: "GET",
      url: "/api/agent/reviews?decision=hold&limit=5",
      headers: {
        authorization: `Bearer ${session.token}`
      }
    });

    expect(reviewsResponse.statusCode).toBe(200);
    expect(reviewsResponse.json().data).toHaveLength(1);
    expect(reviewsResponse.json().data[0].source).toBe("worker");
    expect(reviewsResponse.json().data[0].decision).toBe("hold");

    const reviewSummaryResponse = await app.inject({
      method: "GET",
      url: "/api/agent/reviews/summary?decision=hold",
      headers: {
        authorization: `Bearer ${session.token}`
      }
    });

    expect(reviewSummaryResponse.statusCode).toBe(200);
    expect(reviewSummaryResponse.json().data).toMatchObject({
      totalReviews: 1,
      holdDecisions: 1,
      haltDecisions: 0
    });

    const exportResponse = await app.inject({
      method: "GET",
      url: "/api/agent/reviews/export?decision=hold",
      headers: {
        authorization: `Bearer ${session.token}`
      }
    });

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.body).toContain("reviewedAt,decision,reason");
    expect(exportResponse.body).toContain(",hold,");

    await app.close();
  });
});

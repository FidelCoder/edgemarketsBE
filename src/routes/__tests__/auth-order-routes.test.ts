import { Wallet } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadApp = async () => {
  vi.resetModules();
  const { buildApp } = await import("../../app.js");
  return buildApp();
};

const baseOrderPayload = (walletAddress: string) => ({
  polymarketOrderId: "pm-order-1",
  source: "strategy",
  strategyId: "strategy-btc-breakout",
  creatorHandle: "quantnairobi",
  marketId: "market-btc-100k-2026",
  userId: `wallet:${walletAddress}`,
  walletAddress,
  funderAddress: walletAddress,
  tokenId: "token-yes-1",
  outcome: "YES",
  action: "buy_yes",
  side: "BUY",
  orderType: "GTC",
  price: 0.41,
  size: 100,
  amountUsd: 41,
  status: "submitted",
  tradeStatus: "MATCHED"
});

describe("auth and order routes", () => {
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

  it(
    "verifies a signed challenge and persists an order record",
    async () => {
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

      expect(challengeResponse.statusCode).toBe(201);
      const challengeBody = challengeResponse.json();
      const signature = await wallet.signMessage(challengeBody.data.message);

      const verifyResponse = await app.inject({
        method: "POST",
        url: "/api/auth/verify",
        payload: {
          challengeId: challengeBody.data.id,
          walletAddress: wallet.address,
          signature,
          client: "web"
        }
      });

      expect(verifyResponse.statusCode).toBe(201);
      const sessionBody = verifyResponse.json();

      const orderResponse = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: {
          authorization: `Bearer ${sessionBody.data.token}`
        },
        payload: baseOrderPayload(wallet.address.toLowerCase())
      });

      expect(orderResponse.statusCode).toBe(201);
      expect(orderResponse.json().data.polymarketOrderId).toBe("pm-order-1");

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/orders",
        headers: {
          authorization: `Bearer ${sessionBody.data.token}`
        }
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(1);

      await app.close();
    },
    20000
  );
});

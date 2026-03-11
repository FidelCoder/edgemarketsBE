import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadModules = async () => {
  vi.resetModules();
  const { buildApp } = await import("../../app.js");
  const { getCreatorPerformance } = await import("../orderService.js");
  return { buildApp, getCreatorPerformance };
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
});

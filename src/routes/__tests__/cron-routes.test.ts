import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadApp = async () => {
  vi.resetModules();
  const { buildApp } = await import("../../app.js");
  return buildApp();
};

describe("cron routes", () => {
  beforeEach(() => {
    process.env.STORE_PROVIDER = "memory";
    process.env.POLYMARKET_MARKET_SOURCE = "seed";
    process.env.TRIGGER_WORKER_ENABLED = "false";
    process.env.AGENT_WORKER_ENABLED = "false";
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    delete process.env.STORE_PROVIDER;
    delete process.env.POLYMARKET_MARKET_SOURCE;
    delete process.env.TRIGGER_WORKER_ENABLED;
    delete process.env.AGENT_WORKER_ENABLED;
    delete process.env.CRON_SECRET;
  });

  it("rejects unauthorized cron requests and accepts authorized ones", async () => {
    const app = await loadApp();

    const unauthorizedResponse = await app.inject({
      method: "GET",
      url: "/api/cron/trigger-worker"
    });

    expect(unauthorizedResponse.statusCode).toBe(401);

    const triggerResponse = await app.inject({
      method: "GET",
      url: "/api/cron/trigger-worker",
      headers: {
        authorization: "Bearer test-cron-secret"
      }
    });

    expect(triggerResponse.statusCode).toBe(200);
    expect(triggerResponse.json().data.deploymentTarget).toBe("self-hosted");
    expect(triggerResponse.json().data.summary).toMatchObject({
      processed: expect.any(Number)
    });

    const agentResponse = await app.inject({
      method: "GET",
      url: "/api/cron/agent-worker",
      headers: {
        authorization: "Bearer test-cron-secret"
      }
    });

    expect(agentResponse.statusCode).toBe(200);
    expect(agentResponse.json().data.summary).toMatchObject({
      reviewed: expect.any(Number),
      halted: expect.any(Number)
    });

    await app.close();
  });
});

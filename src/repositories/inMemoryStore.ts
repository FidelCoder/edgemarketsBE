import {
  CreateExecutionLogInput,
  CreateTriggerJobInput,
  ExecutionLog,
  Follow,
  Market,
  StablecoinAsset,
  Strategy,
  TriggerJob,
  TriggerJobQuery
} from "../domain/types.js";
import { createId } from "../utils/id.js";
import { DataStore } from "./dataStore.js";
import {
  createSeedMarkets,
  createSeedStablecoins,
  createSeedStrategies
} from "./seedData.js";

const nowIso = (): string => new Date().toISOString();

const sortByCreatedAtDesc = <T extends { createdAt: string }>(items: T[]): T[] => {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export class InMemoryStore implements DataStore {
  private markets: Market[];
  private strategies: Strategy[];
  private follows: Follow[];
  private stablecoins: StablecoinAsset[];
  private triggerJobs: TriggerJob[];
  private executionLogs: ExecutionLog[];

  constructor() {
    this.markets = createSeedMarkets();
    this.strategies = createSeedStrategies();
    this.follows = [];
    this.stablecoins = createSeedStablecoins();
    this.triggerJobs = [];
    this.executionLogs = [];
  }

  public async connect(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public async listMarkets(): Promise<Market[]> {
    return this.markets;
  }

  public async listStablecoins(): Promise<StablecoinAsset[]> {
    return this.stablecoins;
  }

  public async getMarketById(marketId: string): Promise<Market | undefined> {
    return this.markets.find((market) => market.id === marketId);
  }

  public async listStrategies(): Promise<Strategy[]> {
    return sortByCreatedAtDesc(this.strategies);
  }

  public async getStrategyById(strategyId: string): Promise<Strategy | undefined> {
    return this.strategies.find((strategy) => strategy.id === strategyId);
  }

  public async createStrategy(
    strategy: Omit<Strategy, "id" | "createdAt" | "followerCount">
  ): Promise<Strategy> {
    const created: Strategy = {
      ...strategy,
      id: createId(),
      followerCount: 0,
      createdAt: nowIso()
    };

    this.strategies = [created, ...this.strategies];
    return created;
  }

  public async listFollowsByUser(userId: string): Promise<Follow[]> {
    return sortByCreatedAtDesc(this.follows.filter((follow) => follow.userId === userId));
  }

  public async getFollowByUserAndStrategy(
    userId: string,
    strategyId: string
  ): Promise<Follow | undefined> {
    return this.follows.find((follow) => follow.userId === userId && follow.strategyId === strategyId);
  }

  public async createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow> {
    const created: Follow = {
      ...follow,
      id: createId(),
      status: "active",
      createdAt: nowIso()
    };

    this.follows = [created, ...this.follows];
    this.strategies = this.strategies.map((strategy) =>
      strategy.id === follow.strategyId
        ? {
            ...strategy,
            followerCount: strategy.followerCount + 1
          }
        : strategy
    );

    return created;
  }

  public async listTriggerJobs(query?: TriggerJobQuery): Promise<TriggerJob[]> {
    const filtered = this.triggerJobs.filter((job) => {
      if (query?.status && job.status !== query.status) {
        return false;
      }

      if (query?.userId && job.userId !== query.userId) {
        return false;
      }

      return true;
    });

    return sortByCreatedAtDesc(filtered);
  }

  public async createTriggerJob(payload: CreateTriggerJobInput): Promise<TriggerJob> {
    const timestamp = nowIso();

    const created: TriggerJob = {
      id: createId(),
      strategyId: payload.strategyId,
      userId: payload.userId,
      fundingStablecoin: payload.fundingStablecoin,
      allocationUsd: payload.allocationUsd,
      status: "pending",
      attemptCount: 0,
      maxAttempts: payload.maxAttempts ?? 3,
      nextRunAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.triggerJobs = [created, ...this.triggerJobs];

    return created;
  }

  public async claimNextTriggerJob(nowTimestampIso: string): Promise<TriggerJob | undefined> {
    const nextPending = [...this.triggerJobs]
      .filter((job) => job.status === "pending" && job.nextRunAt <= nowTimestampIso)
      .sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt))[0];

    if (!nextPending) {
      return undefined;
    }

    const claimed: TriggerJob = {
      ...nextPending,
      status: "processing",
      attemptCount: nextPending.attemptCount + 1,
      updatedAt: nowIso()
    };

    this.triggerJobs = this.triggerJobs.map((job) => (job.id === claimed.id ? claimed : job));

    return claimed;
  }

  public async completeTriggerJob(jobId: string): Promise<TriggerJob | undefined> {
    const existing = this.triggerJobs.find((job) => job.id === jobId);

    if (!existing) {
      return undefined;
    }

    const completed: TriggerJob = {
      ...existing,
      status: "completed",
      updatedAt: nowIso(),
      lastError: undefined
    };

    this.triggerJobs = this.triggerJobs.map((job) => (job.id === completed.id ? completed : job));

    return completed;
  }

  public async failTriggerJob(
    jobId: string,
    errorMessage: string,
    retryAtIso?: string
  ): Promise<TriggerJob | undefined> {
    const existing = this.triggerJobs.find((job) => job.id === jobId);

    if (!existing) {
      return undefined;
    }

    const updated: TriggerJob = {
      ...existing,
      status: retryAtIso ? "pending" : "failed",
      nextRunAt: retryAtIso ?? existing.nextRunAt,
      updatedAt: nowIso(),
      lastError: errorMessage
    };

    this.triggerJobs = this.triggerJobs.map((job) => (job.id === updated.id ? updated : job));

    return updated;
  }

  public async listExecutionLogs(userId?: string): Promise<ExecutionLog[]> {
    const filtered = userId
      ? this.executionLogs.filter((log) => log.userId === userId)
      : this.executionLogs;

    return sortByCreatedAtDesc(filtered);
  }

  public async createExecutionLog(payload: CreateExecutionLogInput): Promise<ExecutionLog> {
    const created: ExecutionLog = {
      id: createId(),
      ...payload,
      createdAt: nowIso()
    };

    this.executionLogs = [created, ...this.executionLogs];

    return created;
  }
}

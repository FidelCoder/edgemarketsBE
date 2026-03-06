import {
  AuthSession,
  AuditLog,
  AuditLogQuery,
  CreateAuthSessionInput,
  CreateAuditLogInput,
  CreateExecutionLogInput,
  CreateIdempotencyRecordInput,
  CreateSessionHandoffInput,
  CreateTriggerJobInput,
  ExecutionLog,
  Follow,
  IdempotencyRecord,
  Market,
  SessionHandoff,
  StablecoinAsset,
  Strategy,
  TriggerJob,
  TriggerJobQuery
} from "../domain/types.js";
import {
  assertTransitionAllowed,
  nextStatusForTransition
} from "../domain/triggerStateMachine.js";
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

const makeDuplicateError = (message: string): Error & { code: number } => {
  return Object.assign(new Error(message), { code: 11000 });
};

export class InMemoryStore implements DataStore {
  private markets: Market[];
  private strategies: Strategy[];
  private follows: Follow[];
  private stablecoins: StablecoinAsset[];
  private triggerJobs: TriggerJob[];
  private executionLogs: ExecutionLog[];
  private auditLogs: AuditLog[];
  private idempotencyRecords: IdempotencyRecord[];
  private authSessions: AuthSession[];
  private sessionHandoffs: SessionHandoff[];

  constructor() {
    this.markets = createSeedMarkets();
    this.strategies = createSeedStrategies();
    this.follows = [];
    this.stablecoins = createSeedStablecoins();
    this.triggerJobs = [];
    this.executionLogs = [];
    this.auditLogs = [];
    this.idempotencyRecords = [];
    this.authSessions = [];
    this.sessionHandoffs = [];
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
      stateVersion: 0,
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

    assertTransitionAllowed(nextPending.status, "claim");

    const claimed: TriggerJob = {
      ...nextPending,
      status: nextStatusForTransition("claim"),
      stateVersion: nextPending.stateVersion + 1,
      attemptCount: nextPending.attemptCount + 1,
      updatedAt: nowIso()
    };

    this.triggerJobs = this.triggerJobs.map((job) => (job.id === claimed.id ? claimed : job));

    return claimed;
  }

  public async completeTriggerJob(jobId: string): Promise<TriggerJob | undefined> {
    const existing = this.triggerJobs.find((job) => job.id === jobId);

    if (!existing || existing.status !== "processing") {
      return undefined;
    }

    assertTransitionAllowed(existing.status, "complete");

    const completed: TriggerJob = {
      ...existing,
      status: nextStatusForTransition("complete"),
      stateVersion: existing.stateVersion + 1,
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

    if (!existing || existing.status !== "processing") {
      return undefined;
    }

    const transition = retryAtIso ? "retry" : "fail";

    assertTransitionAllowed(existing.status, transition);

    const updated: TriggerJob = {
      ...existing,
      status: nextStatusForTransition(transition),
      stateVersion: existing.stateVersion + 1,
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

  public async listAuditLogs(query?: AuditLogQuery): Promise<AuditLog[]> {
    const filtered = this.auditLogs.filter((auditLog) => {
      if (query?.actorId && auditLog.actorId !== query.actorId) {
        return false;
      }

      if (query?.entityType && auditLog.entityType !== query.entityType) {
        return false;
      }

      return true;
    });

    const sorted = sortByCreatedAtDesc(filtered);
    const limit = query?.limit ?? 100;

    return sorted.slice(0, limit);
  }

  public async createAuditLog(payload: CreateAuditLogInput): Promise<AuditLog> {
    const created: AuditLog = {
      id: createId(),
      action: payload.action,
      actorType: payload.actorType,
      actorId: payload.actorId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata ?? {},
      createdAt: nowIso()
    };

    this.auditLogs = [created, ...this.auditLogs];

    return created;
  }

  public async getIdempotencyRecord(key: string, scope: string): Promise<IdempotencyRecord | undefined> {
    return this.idempotencyRecords.find((record) => record.key === key && record.scope === scope);
  }

  public async createIdempotencyRecord(
    payload: CreateIdempotencyRecordInput
  ): Promise<IdempotencyRecord> {
    const existing = await this.getIdempotencyRecord(payload.key, payload.scope);

    if (existing) {
      throw makeDuplicateError("Duplicate idempotency record.");
    }

    const created: IdempotencyRecord = {
      id: createId(),
      key: payload.key,
      scope: payload.scope,
      requestHash: payload.requestHash,
      statusCode: payload.statusCode,
      responseBody: payload.responseBody,
      createdAt: nowIso()
    };

    this.idempotencyRecords = [created, ...this.idempotencyRecords];

    return created;
  }

  public async createAuthSession(payload: CreateAuthSessionInput): Promise<AuthSession> {
    const timestamp = nowIso();

    const created: AuthSession = {
      id: createId(),
      token: `sess_${createId()}`,
      walletAddress: payload.walletAddress.toLowerCase(),
      userId: `wallet:${payload.walletAddress.toLowerCase()}`,
      client: payload.client,
      linkedSessionId: payload.linkedSessionId,
      createdAt: timestamp,
      lastActiveAt: timestamp
    };

    this.authSessions = [created, ...this.authSessions];

    return created;
  }

  public async getAuthSessionByToken(token: string): Promise<AuthSession | undefined> {
    return this.authSessions.find((session) => session.token === token);
  }

  public async updateAuthSessionLastActive(token: string): Promise<AuthSession | undefined> {
    const existing = await this.getAuthSessionByToken(token);

    if (!existing) {
      return undefined;
    }

    const updated: AuthSession = {
      ...existing,
      lastActiveAt: nowIso()
    };

    this.authSessions = this.authSessions.map((session) => (session.id === existing.id ? updated : session));

    return updated;
  }

  public async createSessionHandoff(payload: CreateSessionHandoffInput): Promise<SessionHandoff> {
    const duplicate = this.sessionHandoffs.find((handoff) => handoff.code === payload.code);

    if (duplicate) {
      throw makeDuplicateError("Duplicate handoff code.");
    }

    const created: SessionHandoff = {
      id: createId(),
      code: payload.code,
      sourceSessionId: payload.sourceSessionId,
      walletAddress: payload.walletAddress.toLowerCase(),
      userId: payload.userId,
      createdAt: nowIso(),
      expiresAt: payload.expiresAt
    };

    this.sessionHandoffs = [created, ...this.sessionHandoffs];

    return created;
  }

  public async consumeSessionHandoff(
    code: string,
    consumedAtIso: string
  ): Promise<SessionHandoff | undefined> {
    const existing = this.sessionHandoffs.find(
      (handoff) => handoff.code === code && !handoff.consumedAt && handoff.expiresAt > consumedAtIso
    );

    if (!existing) {
      return undefined;
    }

    const consumed: SessionHandoff = {
      ...existing,
      consumedAt: consumedAtIso
    };

    this.sessionHandoffs = this.sessionHandoffs.map((handoff) =>
      handoff.id === existing.id ? consumed : handoff
    );

    return consumed;
  }
}

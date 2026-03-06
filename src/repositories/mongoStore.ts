import { Collection, Db, MongoClient } from "mongodb";
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
import { createId } from "../utils/id.js";
import { DataStore } from "./dataStore.js";
import {
  createSeedMarkets,
  createSeedStablecoins,
  createSeedStrategies
} from "./seedData.js";

interface StoreCollections {
  markets: Collection<Market>;
  strategies: Collection<Strategy>;
  follows: Collection<Follow>;
  stablecoins: Collection<StablecoinAsset>;
  triggerJobs: Collection<TriggerJob>;
  executionLogs: Collection<ExecutionLog>;
  auditLogs: Collection<AuditLog>;
  idempotencyRecords: Collection<IdempotencyRecord>;
  authSessions: Collection<AuthSession>;
  sessionHandoffs: Collection<SessionHandoff>;
}

const nowIso = (): string => new Date().toISOString();

const sortByCreatedAtDesc = { createdAt: -1 } as const;

export class MongoStore implements DataStore {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private db: Db | null;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.dbName = dbName;
    this.db = null;
  }

  public async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    const collections = this.getCollections();

    await Promise.all([
      collections.markets.createIndex({ id: 1 }, { unique: true }),
      collections.strategies.createIndex({ id: 1 }, { unique: true }),
      collections.follows.createIndex({ id: 1 }, { unique: true }),
      collections.follows.createIndex({ userId: 1, strategyId: 1 }, { unique: true }),
      collections.stablecoins.createIndex({ symbol: 1 }, { unique: true }),
      collections.triggerJobs.createIndex({ id: 1 }, { unique: true }),
      collections.triggerJobs.createIndex({ status: 1, nextRunAt: 1 }),
      collections.executionLogs.createIndex({ id: 1 }, { unique: true }),
      collections.executionLogs.createIndex({ userId: 1, createdAt: -1 }),
      collections.auditLogs.createIndex({ id: 1 }, { unique: true }),
      collections.auditLogs.createIndex({ entityType: 1, createdAt: -1 }),
      collections.idempotencyRecords.createIndex({ id: 1 }, { unique: true }),
      collections.idempotencyRecords.createIndex({ scope: 1, key: 1 }, { unique: true }),
      collections.authSessions.createIndex({ id: 1 }, { unique: true }),
      collections.authSessions.createIndex({ token: 1 }, { unique: true }),
      collections.authSessions.createIndex({ walletAddress: 1, client: 1, createdAt: -1 }),
      collections.sessionHandoffs.createIndex({ id: 1 }, { unique: true }),
      collections.sessionHandoffs.createIndex({ code: 1 }, { unique: true }),
      collections.sessionHandoffs.createIndex({ expiresAt: 1 })
    ]);

    await this.seedIfEmpty();
  }

  public async close(): Promise<void> {
    await this.client.close();
    this.db = null;
  }

  public async listMarkets(): Promise<Market[]> {
    return this.getCollections().markets.find({}, { projection: { _id: 0 } }).toArray();
  }

  public async listStablecoins(): Promise<StablecoinAsset[]> {
    return this.getCollections().stablecoins.find({}, { projection: { _id: 0 } }).toArray();
  }

  public async getMarketById(marketId: string): Promise<Market | undefined> {
    return this.getCollections().markets.findOne(
      { id: marketId },
      { projection: { _id: 0 } }
    ) as Promise<Market | undefined>;
  }

  public async listStrategies(): Promise<Strategy[]> {
    return this.getCollections()
      .strategies
      .find({}, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
  }

  public async getStrategyById(strategyId: string): Promise<Strategy | undefined> {
    return this.getCollections().strategies.findOne(
      { id: strategyId },
      { projection: { _id: 0 } }
    ) as Promise<Strategy | undefined>;
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

    await this.getCollections().strategies.insertOne(created);
    return created;
  }

  public async listFollowsByUser(userId: string): Promise<Follow[]> {
    return this.getCollections()
      .follows
      .find({ userId }, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
  }

  public async getFollowByUserAndStrategy(
    userId: string,
    strategyId: string
  ): Promise<Follow | undefined> {
    return this.getCollections().follows.findOne(
      { userId, strategyId },
      { projection: { _id: 0 } }
    ) as Promise<Follow | undefined>;
  }

  public async createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow> {
    const created: Follow = {
      ...follow,
      id: createId(),
      status: "active",
      createdAt: nowIso()
    };

    const collections = this.getCollections();

    await collections.follows.insertOne(created);
    await collections.strategies.updateOne(
      { id: follow.strategyId },
      { $inc: { followerCount: 1 } }
    );

    return created;
  }

  public async listTriggerJobs(query?: TriggerJobQuery): Promise<TriggerJob[]> {
    const filter: Record<string, string> = {};

    if (query?.status) {
      filter.status = query.status;
    }

    if (query?.userId) {
      filter.userId = query.userId;
    }

    return this.getCollections()
      .triggerJobs
      .find(filter, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
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

    await this.getCollections().triggerJobs.insertOne(created);

    return created;
  }

  public async claimNextTriggerJob(nowTimestampIso: string): Promise<TriggerJob | undefined> {
    const collections = this.getCollections();

    const result = await collections.triggerJobs.findOneAndUpdate(
      { status: "pending", nextRunAt: { $lte: nowTimestampIso } },
      {
        $set: {
          status: "processing",
          updatedAt: nowIso()
        },
        $inc: {
          attemptCount: 1,
          stateVersion: 1
        }
      },
      {
        sort: { nextRunAt: 1, createdAt: 1 },
        projection: { _id: 0 },
        returnDocument: "after"
      }
    );

    return this.extractFindOneAndUpdateResult<TriggerJob>(result) ?? undefined;
  }

  public async completeTriggerJob(jobId: string): Promise<TriggerJob | undefined> {
    const result = await this.getCollections().triggerJobs.findOneAndUpdate(
      { id: jobId, status: "processing" },
      {
        $set: {
          status: "completed",
          updatedAt: nowIso()
        },
        $unset: {
          lastError: ""
        },
        $inc: {
          stateVersion: 1
        }
      },
      {
        projection: { _id: 0 },
        returnDocument: "after"
      }
    );

    return this.extractFindOneAndUpdateResult<TriggerJob>(result) ?? undefined;
  }

  public async failTriggerJob(
    jobId: string,
    errorMessage: string,
    retryAtIso?: string
  ): Promise<TriggerJob | undefined> {
    const nextStatus = retryAtIso ? "pending" : "failed";
    const setValues: Partial<TriggerJob> = {
      status: nextStatus,
      updatedAt: nowIso(),
      lastError: errorMessage
    };

    if (retryAtIso) {
      setValues.nextRunAt = retryAtIso;
    }

    const result = await this.getCollections().triggerJobs.findOneAndUpdate(
      { id: jobId, status: "processing" },
      {
        $set: setValues,
        $inc: {
          stateVersion: 1
        }
      },
      {
        projection: { _id: 0 },
        returnDocument: "after"
      }
    );

    return this.extractFindOneAndUpdateResult<TriggerJob>(result) ?? undefined;
  }

  public async listExecutionLogs(userId?: string): Promise<ExecutionLog[]> {
    const filter = userId ? { userId } : {};

    return this.getCollections()
      .executionLogs
      .find(filter, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
  }

  public async createExecutionLog(payload: CreateExecutionLogInput): Promise<ExecutionLog> {
    const created: ExecutionLog = {
      id: createId(),
      ...payload,
      createdAt: nowIso()
    };

    await this.getCollections().executionLogs.insertOne(created);

    return created;
  }

  public async listAuditLogs(query?: AuditLogQuery): Promise<AuditLog[]> {
    const filter: Record<string, string> = {};

    if (query?.actorId) {
      filter.actorId = query.actorId;
    }

    if (query?.entityType) {
      filter.entityType = query.entityType;
    }

    const limit = query?.limit ?? 100;

    return this.getCollections()
      .auditLogs
      .find(filter, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .limit(limit)
      .toArray();
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

    await this.getCollections().auditLogs.insertOne(created);

    return created;
  }

  public async getIdempotencyRecord(
    key: string,
    scope: string
  ): Promise<IdempotencyRecord | undefined> {
    return this.getCollections().idempotencyRecords.findOne(
      { key, scope },
      { projection: { _id: 0 } }
    ) as Promise<IdempotencyRecord | undefined>;
  }

  public async createIdempotencyRecord(
    payload: CreateIdempotencyRecordInput
  ): Promise<IdempotencyRecord> {
    const created: IdempotencyRecord = {
      id: createId(),
      key: payload.key,
      scope: payload.scope,
      requestHash: payload.requestHash,
      statusCode: payload.statusCode,
      responseBody: payload.responseBody,
      createdAt: nowIso()
    };

    await this.getCollections().idempotencyRecords.insertOne(created);

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

    await this.getCollections().authSessions.insertOne(created);

    return created;
  }

  public async getAuthSessionByToken(token: string): Promise<AuthSession | undefined> {
    return this.getCollections().authSessions.findOne(
      { token },
      { projection: { _id: 0 } }
    ) as Promise<AuthSession | undefined>;
  }

  public async updateAuthSessionLastActive(token: string): Promise<AuthSession | undefined> {
    const result = await this.getCollections().authSessions.findOneAndUpdate(
      { token },
      {
        $set: {
          lastActiveAt: nowIso()
        }
      },
      {
        projection: { _id: 0 },
        returnDocument: "after"
      }
    );

    return this.extractFindOneAndUpdateResult<AuthSession>(result) ?? undefined;
  }

  public async createSessionHandoff(payload: CreateSessionHandoffInput): Promise<SessionHandoff> {
    const created: SessionHandoff = {
      id: createId(),
      code: payload.code,
      sourceSessionId: payload.sourceSessionId,
      walletAddress: payload.walletAddress.toLowerCase(),
      userId: payload.userId,
      createdAt: nowIso(),
      expiresAt: payload.expiresAt
    };

    await this.getCollections().sessionHandoffs.insertOne(created);

    return created;
  }

  public async consumeSessionHandoff(
    code: string,
    consumedAtIso: string
  ): Promise<SessionHandoff | undefined> {
    const result = await this.getCollections().sessionHandoffs.findOneAndUpdate(
      { code, consumedAt: { $exists: false }, expiresAt: { $gt: consumedAtIso } },
      {
        $set: {
          consumedAt: consumedAtIso
        }
      },
      {
        projection: { _id: 0 },
        returnDocument: "after"
      }
    );

    return this.extractFindOneAndUpdateResult<SessionHandoff>(result) ?? undefined;
  }

  private getCollections(): StoreCollections {
    if (!this.db) {
      throw new Error("MongoStore is not connected.");
    }

    return {
      markets: this.db.collection<Market>("markets"),
      strategies: this.db.collection<Strategy>("strategies"),
      follows: this.db.collection<Follow>("follows"),
      stablecoins: this.db.collection<StablecoinAsset>("stablecoins"),
      triggerJobs: this.db.collection<TriggerJob>("trigger_jobs"),
      executionLogs: this.db.collection<ExecutionLog>("execution_logs"),
      auditLogs: this.db.collection<AuditLog>("audit_logs"),
      idempotencyRecords: this.db.collection<IdempotencyRecord>("idempotency_records"),
      authSessions: this.db.collection<AuthSession>("auth_sessions"),
      sessionHandoffs: this.db.collection<SessionHandoff>("session_handoffs")
    };
  }

  private async seedIfEmpty(): Promise<void> {
    const collections = this.getCollections();

    const [marketCount, strategyCount, stablecoinCount] = await Promise.all([
      collections.markets.countDocuments(),
      collections.strategies.countDocuments(),
      collections.stablecoins.countDocuments()
    ]);

    if (marketCount === 0) {
      await collections.markets.insertMany(createSeedMarkets());
    }

    if (strategyCount === 0) {
      await collections.strategies.insertMany(createSeedStrategies());
    }

    if (stablecoinCount === 0) {
      await collections.stablecoins.insertMany(createSeedStablecoins());
    }
  }

  private extractFindOneAndUpdateResult<T>(result: unknown): T | null {
    if (!result) {
      return null;
    }

    if (typeof result === "object" && "value" in result) {
      return (result as { value: T | null }).value;
    }

    return result as T;
  }
}

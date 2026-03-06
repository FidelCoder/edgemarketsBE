import {
  AuditLog,
  AuditLogQuery,
  CreateAuditLogInput,
  CreateExecutionLogInput,
  CreateIdempotencyRecordInput,
  CreateTriggerJobInput,
  ExecutionLog,
  Follow,
  IdempotencyRecord,
  Market,
  StablecoinAsset,
  Strategy,
  TriggerJob,
  TriggerJobQuery
} from "../domain/types.js";

export interface DataStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  listMarkets(): Promise<Market[]>;
  listStablecoins(): Promise<StablecoinAsset[]>;
  getMarketById(marketId: string): Promise<Market | undefined>;
  listStrategies(): Promise<Strategy[]>;
  getStrategyById(strategyId: string): Promise<Strategy | undefined>;
  createStrategy(strategy: Omit<Strategy, "id" | "createdAt" | "followerCount">): Promise<Strategy>;
  listFollowsByUser(userId: string): Promise<Follow[]>;
  getFollowByUserAndStrategy(userId: string, strategyId: string): Promise<Follow | undefined>;
  createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow>;
  listTriggerJobs(query?: TriggerJobQuery): Promise<TriggerJob[]>;
  createTriggerJob(payload: CreateTriggerJobInput): Promise<TriggerJob>;
  claimNextTriggerJob(nowIso: string): Promise<TriggerJob | undefined>;
  completeTriggerJob(jobId: string): Promise<TriggerJob | undefined>;
  failTriggerJob(jobId: string, errorMessage: string, retryAtIso?: string): Promise<TriggerJob | undefined>;
  listExecutionLogs(userId?: string): Promise<ExecutionLog[]>;
  createExecutionLog(payload: CreateExecutionLogInput): Promise<ExecutionLog>;
  listAuditLogs(query?: AuditLogQuery): Promise<AuditLog[]>;
  createAuditLog(payload: CreateAuditLogInput): Promise<AuditLog>;
  getIdempotencyRecord(key: string, scope: string): Promise<IdempotencyRecord | undefined>;
  createIdempotencyRecord(payload: CreateIdempotencyRecordInput): Promise<IdempotencyRecord>;
}

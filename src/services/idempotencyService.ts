import { createHash } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { ApiResponse } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

interface MutationOutcome<T> {
  statusCode: number;
  body: ApiResponse<T>;
}

interface IdempotentMutationInput<T> {
  scope: string;
  actorId: string;
  idempotencyKey?: string;
  requestBody: unknown;
  execute: () => Promise<MutationOutcome<T>>;
}

export interface IdempotentMutationResult<T> {
  statusCode: number;
  body: ApiResponse<T>;
  replayed: boolean;
  key?: string;
}

const toCanonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonicalJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  const encodedEntries = entries.map(
    ([key, entryValue]) => `${JSON.stringify(key)}:${toCanonicalJson(entryValue)}`
  );

  return `{${encodedEntries.join(",")}}`;
};

const hashRequestBody = (requestBody: unknown): string => {
  return createHash("sha256").update(toCanonicalJson(requestBody)).digest("hex");
};

const parseStoredBody = <T>(serializedBody: string): ApiResponse<T> => {
  try {
    const parsed = JSON.parse(serializedBody) as ApiResponse<T>;

    if (!parsed || typeof parsed !== "object" || !("data" in parsed) || !("error" in parsed)) {
      throw new Error("Invalid response shape.");
    }

    return parsed;
  } catch {
    throw new AppError("Stored idempotency response is invalid.", 500);
  }
};

const isDuplicateMongoError = (error: unknown): boolean => {
  return (error as { code?: number } | null)?.code === 11000;
};

const assertHashMatch = (storedHash: string, incomingHash: string): void => {
  if (storedHash !== incomingHash) {
    throw new AppError("Idempotency key has already been used with a different payload.", 409);
  }
};

const recordIdempotencyReplayAudit = async (key: string, scope: string, actorId: string): Promise<void> => {
  await createAuditLog({
    action: "idempotency.replayed",
    actorType: "user",
    actorId,
    entityType: "idempotency",
    entityId: key,
    metadata: {
      scope
    }
  });
};

const recordIdempotencyCreatedAudit = async (key: string, scope: string, actorId: string): Promise<void> => {
  await createAuditLog({
    action: "idempotency.created",
    actorType: "user",
    actorId,
    entityType: "idempotency",
    entityId: key,
    metadata: {
      scope
    }
  });
};

const resolveStoredMutationResult = async <T>(
  scope: string,
  key: string,
  requestHash: string,
  actorId: string
): Promise<IdempotentMutationResult<T>> => {
  const store = getStore();
  const existing = await store.getIdempotencyRecord(key, scope);

  if (!existing) {
    throw new AppError("Idempotency record was not found after duplicate insert.", 500);
  }

  assertHashMatch(existing.requestHash, requestHash);
  await recordIdempotencyReplayAudit(key, scope, actorId);

  return {
    statusCode: existing.statusCode,
    body: parseStoredBody<T>(existing.responseBody),
    replayed: true,
    key
  };
};

export const parseIdempotencyKey = (headerValue: string | string[] | undefined): string | undefined => {
  if (!headerValue) {
    return undefined;
  }

  if (Array.isArray(headerValue)) {
    throw new AppError("Only one Idempotency-Key header value is allowed.", 400);
  }

  const normalized = headerValue.trim();

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new AppError("Idempotency-Key must be 8-128 chars using letters, digits, :, _, -.", 400);
  }

  return normalized;
};

export const runIdempotentMutation = async <T>(
  input: IdempotentMutationInput<T>
): Promise<IdempotentMutationResult<T>> => {
  if (!input.idempotencyKey) {
    const directResult = await input.execute();
    return {
      statusCode: directResult.statusCode,
      body: directResult.body,
      replayed: false
    };
  }

  const store = getStore();
  const requestHash = hashRequestBody(input.requestBody);
  const existing = await store.getIdempotencyRecord(input.idempotencyKey, input.scope);

  if (existing) {
    assertHashMatch(existing.requestHash, requestHash);
    await recordIdempotencyReplayAudit(input.idempotencyKey, input.scope, input.actorId);

    return {
      statusCode: existing.statusCode,
      body: parseStoredBody<T>(existing.responseBody),
      replayed: true,
      key: input.idempotencyKey
    };
  }

  const freshResult = await input.execute();
  const serializedBody = JSON.stringify(freshResult.body);

  try {
    await store.createIdempotencyRecord({
      key: input.idempotencyKey,
      scope: input.scope,
      requestHash,
      statusCode: freshResult.statusCode,
      responseBody: serializedBody
    });
  } catch (error) {
    if (isDuplicateMongoError(error)) {
      return resolveStoredMutationResult<T>(
        input.scope,
        input.idempotencyKey,
        requestHash,
        input.actorId
      );
    }

    throw error;
  }

  await recordIdempotencyCreatedAudit(input.idempotencyKey, input.scope, input.actorId);

  return {
    statusCode: freshResult.statusCode,
    body: freshResult.body,
    replayed: false,
    key: input.idempotencyKey
  };
};

import {
  AuditLog,
  AuditLogQuery,
  CreateAuditLogInput
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";

export const listAuditLogs = async (query?: AuditLogQuery): Promise<AuditLog[]> => {
  const store = getStore();
  return store.listAuditLogs(query);
};

export const createAuditLog = async (payload: CreateAuditLogInput): Promise<AuditLog> => {
  const store = getStore();
  return store.createAuditLog(payload);
};

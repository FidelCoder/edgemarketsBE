import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { auditLogQuerySchema } from "../domain/validators.js";
import { listAuditLogs } from "../services/auditService.js";

export const registerAuditRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/audit-logs", async (request) => {
    const parsedQuery = auditLogQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid audit log query.", 400);
    }

    return {
      data: await listAuditLogs(parsedQuery.data),
      error: null
    };
  });
};

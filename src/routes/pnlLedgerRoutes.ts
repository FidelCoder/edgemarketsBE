import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { pnlLedgerQuerySchema } from "../domain/validators.js";
import { getCurrentSession } from "../services/authService.js";
import {
  exportUserPnlLedgerCsv,
  getUserPnlLedgerRollups,
  getUserPnlLedgerSummary,
  listUserPnlLedgerEntries
} from "../services/pnlLedgerService.js";

export const registerPnlLedgerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/pnl-ledger", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = pnlLedgerQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid pnl ledger query.", 400);
    }

    return {
      data: await listUserPnlLedgerEntries(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.get("/api/pnl-ledger/summary", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = pnlLedgerQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid pnl ledger summary query.", 400);
    }

    return {
      data: await getUserPnlLedgerSummary(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.get("/api/pnl-ledger/rollups", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = pnlLedgerQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid pnl ledger rollup query.", 400);
    }

    return {
      data: await getUserPnlLedgerRollups(session.userId, parsedQuery.data),
      error: null
    };
  });

  app.get("/api/pnl-ledger/export", async (request, reply) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = pnlLedgerQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid pnl ledger export query.", 400);
    }

    const csv = await exportUserPnlLedgerCsv(session.userId, parsedQuery.data);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="edge-pnl-ledger.csv"');
    return reply.send(csv);
  });
};

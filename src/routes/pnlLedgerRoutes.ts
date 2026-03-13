import { FastifyInstance } from "fastify";
import { AppError } from "../domain/errors.js";
import { pnlLedgerQuerySchema } from "../domain/validators.js";
import { getCurrentSession } from "../services/authService.js";
import { getUserPnlLedgerRollups, getUserPnlLedgerSummary, listUserPnlLedgerEntries } from "../services/pnlLedgerService.js";

export const registerPnlLedgerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/api/pnl-ledger", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);
    const parsedQuery = pnlLedgerQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      throw new AppError(parsedQuery.error.errors[0]?.message ?? "Invalid pnl ledger query.", 400);
    }

    return {
      data: await listUserPnlLedgerEntries(session.userId, parsedQuery.data.limit ?? 20),
      error: null
    };
  });

  app.get("/api/pnl-ledger/summary", async (request) => {
    const session = await getCurrentSession(request.headers.authorization);

    return {
      data: await getUserPnlLedgerSummary(session.userId),
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
      data: await getUserPnlLedgerRollups(session.userId, parsedQuery.data.limit ?? 5),
      error: null
    };
  });
};

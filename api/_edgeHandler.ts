import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let appPromise: Promise<FastifyInstance> | null = null;

const getApp = async (): Promise<FastifyInstance> => {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }

  return appPromise;
};

const rewriteRequestUrl = (req: IncomingMessage): void => {
  const requestUrl = req.url ?? "/api";
  const parsedUrl = new URL(requestUrl, "https://edgemarkets-backend.vercel.app");
  const rewrittenPath = parsedUrl.searchParams.get("edge_path");

  if (!rewrittenPath) {
    return;
  }

  parsedUrl.searchParams.delete("edge_path");
  const nextQuery = parsedUrl.searchParams.toString();
  req.url = `${rewrittenPath}${nextQuery ? `?${nextQuery}` : ""}`;
};

const sendFallbackError = (res: ServerResponse): void => {
  res.statusCode = 500;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      data: null,
      error: {
        message: "EdgeMarkets backend failed to initialize."
      }
    })
  );
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    rewriteRequestUrl(req);
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (error) {
    console.error("Failed to handle Vercel Fastify request.", error);
    sendFallbackError(res);
  }
}

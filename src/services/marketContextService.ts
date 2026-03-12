import { AppError } from "../domain/errors.js";
import { MarketComment, MarketContext, MarketPricePoint } from "../domain/types.js";
import { env } from "../config/env.js";
import { getMarketById } from "./polymarketService.js";

interface RawGammaEvent {
  title?: string;
  subtitle?: string | null;
  slug?: string;
}

interface RawGammaMarketDetails {
  id?: number | string;
  question?: string;
  description?: string | null;
  resolutionSource?: string | null;
  image?: string | null;
  featuredImage?: string | null;
  volume24hr?: number | string | null;
  commentCount?: number | string | null;
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
  lastTradePrice?: number | string | null;
  oneDayPriceChange?: number | string | null;
  oneWeekPriceChange?: number | string | null;
  commentsEnabled?: boolean;
  events?: RawGammaEvent[];
}

interface RawPriceHistoryPoint {
  t?: number | string;
  p?: number | string;
}

interface RawPriceHistoryResponse {
  history?: RawPriceHistoryPoint[];
}

interface RawCommentProfile {
  displayUsernamePublic?: string | null;
  name?: string | null;
  pseudonym?: string | null;
  profileImage?: string | null;
}

interface RawGammaComment {
  id?: number | string;
  body?: string | null;
  userAddress?: string | null;
  createdAt?: string | null;
  reactionCount?: number | string | null;
  profile?: RawCommentProfile | null;
}

interface MarketContextCacheEntry {
  expiresAt: number;
  context: MarketContext;
}

const contextCache = new Map<string, MarketContextCacheEntry>();

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIsoTimestamp = (value: number | string | undefined): string | null => {
  if (typeof value === "undefined") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const milliseconds = parsed > 9_999_999_999 ? parsed : parsed * 1000;
  return new Date(milliseconds).toISOString();
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Polymarket upstream failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
};

const getHistoryWindow = (endDate: string | null): { interval: string; fidelity: number } => {
  if (!endDate) {
    return { interval: "1w", fidelity: 60 };
  }

  const hoursRemaining = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursRemaining <= 24) {
    return { interval: "1d", fidelity: 15 };
  }

  if (hoursRemaining <= 72) {
    return { interval: "1d", fidelity: 60 };
  }

  return { interval: "1w", fidelity: 60 };
};

const normalizeHistory = (history: RawPriceHistoryResponse | RawPriceHistoryPoint[]): MarketPricePoint[] => {
  const source = Array.isArray(history) ? history : history.history ?? [];

  return source
    .map((point) => {
      const timestamp = toIsoTimestamp(point.t);
      const price = toNumber(point.p);

      if (!timestamp || price === null) {
        return null;
      }

      return {
        timestamp,
        price
      };
    })
    .filter((point): point is MarketPricePoint => Boolean(point));
};

const normalizeComment = (comment: RawGammaComment): MarketComment | null => {
  if (!comment.body?.trim()) {
    return null;
  }

  return {
    id: String(comment.id ?? `${comment.createdAt ?? "comment"}:${comment.userAddress ?? "anon"}`),
    body: comment.body.trim(),
    userAddress: comment.userAddress?.toLowerCase() ?? null,
    displayName: comment.profile?.displayUsernamePublic ?? comment.profile?.name ?? null,
    pseudonym: comment.profile?.pseudonym ?? null,
    profileImage: comment.profile?.profileImage ?? null,
    reactionCount: toNumber(comment.reactionCount) ?? 0,
    createdAt: comment.createdAt ?? new Date().toISOString()
  };
};

const getCachedContext = (marketId: string): MarketContext | null => {
  const cached = contextCache.get(marketId);

  if (!cached || cached.expiresAt <= Date.now()) {
    contextCache.delete(marketId);
    return null;
  }

  return cached.context;
};

const setCachedContext = (marketId: string, context: MarketContext): void => {
  contextCache.set(marketId, {
    context,
    expiresAt: Date.now() + Math.min(env.polymarketMarketCacheTtlMs, 120_000)
  });
};

export const getMarketContext = async (marketId: string): Promise<MarketContext> => {
  const cached = getCachedContext(marketId);
  if (cached) {
    return cached;
  }

  const market = await getMarketById(marketId);
  if (!market) {
    throw new AppError("Market not found.", 404);
  }

  const marketDetails = await fetchJson<RawGammaMarketDetails>(
    `${env.polymarketGammaHost}/markets/slug/${encodeURIComponent(market.slug)}`
  );
  const gammaMarketId = marketDetails.id;
  const historyWindow = getHistoryWindow(market.endDate);
  const historyUrl = new URL(`${env.polymarketHost}/prices-history`);
  historyUrl.searchParams.set("market", market.yesTokenId);
  historyUrl.searchParams.set("interval", historyWindow.interval);
  historyUrl.searchParams.set("fidelity", String(historyWindow.fidelity));

  const commentsUrl = new URL(`${env.polymarketGammaHost}/comments`);
  commentsUrl.searchParams.set("limit", "6");
  commentsUrl.searchParams.set("offset", "0");
  commentsUrl.searchParams.set("order", "createdAt");
  commentsUrl.searchParams.set("ascending", "false");

  if (gammaMarketId !== undefined) {
    commentsUrl.searchParams.set("parentEntityType", "market");
    commentsUrl.searchParams.set("parentEntityID", String(gammaMarketId));
  }

  const [historyResponse, commentsResponse] = await Promise.all([
    fetchJson<RawPriceHistoryResponse | RawPriceHistoryPoint[]>(historyUrl.toString()).catch(() => ({ history: [] })),
    gammaMarketId !== undefined
      ? fetchJson<RawGammaComment[]>(commentsUrl.toString()).catch(() => [])
      : Promise.resolve([] as RawGammaComment[])
  ]);

  const leadEvent = marketDetails.events?.[0];
  const context: MarketContext = {
    marketId: market.id,
    question: market.question,
    description: marketDetails.description ?? null,
    resolutionSource: marketDetails.resolutionSource ?? null,
    image: marketDetails.image ?? market.icon,
    featuredImage: marketDetails.featuredImage ?? market.icon,
    eventTitle: leadEvent?.title ?? null,
    eventSubtitle: leadEvent?.subtitle ?? null,
    eventSlug: leadEvent?.slug ?? null,
    volume24hr: toNumber(marketDetails.volume24hr),
    commentCount: toNumber(marketDetails.commentCount),
    bestBid: toNumber(marketDetails.bestBid),
    bestAsk: toNumber(marketDetails.bestAsk),
    lastTradePrice: toNumber(marketDetails.lastTradePrice),
    oneDayPriceChange: toNumber(marketDetails.oneDayPriceChange),
    oneWeekPriceChange: toNumber(marketDetails.oneWeekPriceChange),
    commentsEnabled: Boolean(marketDetails.commentsEnabled),
    priceHistory: normalizeHistory(historyResponse),
    comments: commentsResponse
      .map(normalizeComment)
      .filter((comment): comment is MarketComment => Boolean(comment))
  };

  setCachedContext(marketId, context);
  return context;
};

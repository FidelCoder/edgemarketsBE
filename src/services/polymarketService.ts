import { env } from "../config/env.js";
import { Market, PolymarketPublicProfile } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";

interface RawGammaMarket {
  conditionId?: string;
  condition_id?: string;
  question?: string;
  category?: string;
  slug?: string;
  icon?: string | null;
  endDate?: string | null;
  endDateIso?: string | null;
  updatedAt?: string;
  liquidity?: number | string;
  liquidityNum?: number | string;
  outcomePrices?: string | string[];
  outcomes?: string | string[];
  clobTokenIds?: string | string[];
  active?: boolean;
  closed?: boolean;
  enableOrderBook?: boolean;
  negRisk?: boolean;
  tags?: Array<{ label?: string }>;
}

interface GammaProfileResponse {
  proxyWallet?: string | null;
  profileImage?: string | null;
  pseudonym?: string | null;
  name?: string | null;
}

interface MarketCacheEntry {
  expiresAt: number;
  markets: Market[];
  allMarkets: Market[];
}

let marketCache: MarketCacheEntry | null = null;

const nowIso = (): string => new Date().toISOString();

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const inferCategoryFromQuestion = (question: string): string | null => {
  const normalized = question.toLowerCase();

  if (/\b(bitcoin|btc|ethereum|eth|solana|xrp|doge|crypto)\b/.test(normalized)) {
    return "Crypto";
  }

  if (/\b(election|president|trump|senate|house|democrat|republican|government)\b/.test(normalized)) {
    return "Politics";
  }

  if (/\b(fed|rates|cpi|inflation|recession|gdp|unemployment|economy)\b/.test(normalized)) {
    return "Macro";
  }

  if (/\b(nba|nfl|mlb|nhl|soccer|football|champions league|ufc|tennis)\b/.test(normalized)) {
    return "Sports";
  }

  if (/\b(oscar|grammy|movie|album|box office|tv|celebrity)\b/.test(normalized)) {
    return "Culture";
  }

  if (/\b(ai|openai|xai|tesla|apple|nvidia|meta|google)\b/.test(normalized)) {
    return "Tech";
  }

  return null;
};

const toCategory = (market: RawGammaMarket): string => {
  if (market.category && market.category.trim().length > 0 && market.category.trim().toLowerCase() !== "polymarket") {
    return market.category;
  }

  const tagLabel = market.tags?.find((tag) => tag.label?.trim())?.label;

  if (tagLabel && tagLabel.trim().toLowerCase() !== "polymarket") {
    return tagLabel;
  }

  return inferCategoryFromQuestion(market.question ?? "") ?? "Polymarket";
};

const intervalSeriesPattern =
  /\s*-\s*[a-z]{3,9}\s+\d{1,2},\s+\d{1,2}:\d{2}(?:am|pm)-\d{1,2}:\d{2}(?:am|pm)\s+[a-z]{2,4}$/i;

const toSeriesKey = (question: string): string => {
  return question.toLowerCase().replace(intervalSeriesPattern, "").replace(/\?$/, "").replace(/\s+/g, " ").trim();
};

const isIntervalSeriesMarket = (question: string): boolean => {
  return intervalSeriesPattern.test(question) && /\bup or down\b/i.test(question);
};

const curateMarkets = (markets: Market[]): { curated: Market[]; all: Market[] } => {
  const all = [...markets].sort((left, right) => right.liquidityUsd - left.liquidityUsd);
  const curated: Market[] = [];
  const seriesCounts = new Map<string, number>();

  for (const market of all) {
    const seriesKey = toSeriesKey(market.question);
    const existingCount = seriesCounts.get(seriesKey) ?? 0;
    const seriesLimit = isIntervalSeriesMarket(market.question) ? 1 : 2;

    if (existingCount >= seriesLimit) {
      continue;
    }

    curated.push(market);
    seriesCounts.set(seriesKey, existingCount + 1);

    if (curated.length >= env.polymarketMarketLimit) {
      break;
    }
  }

  return { curated, all };
};

const normalizeMarket = (market: RawGammaMarket): Market | null => {
  const conditionId = market.conditionId ?? market.condition_id;
  const question = market.question?.trim();
  const tokenIds = toArray(market.clobTokenIds);
  const outcomePrices = toArray(market.outcomePrices).map((value) => Number(value));
  const outcomes = toArray(market.outcomes).map((value) => value.toUpperCase());
  const yesIndex = outcomes.findIndex((value) => value === "YES");
  const noIndex = outcomes.findIndex((value) => value === "NO");
  const resolvedYesIndex = yesIndex >= 0 ? yesIndex : 0;
  const resolvedNoIndex = noIndex >= 0 ? noIndex : 1;

  if (!conditionId || !question || tokenIds.length < 2) {
    return null;
  }

  return {
    id: conditionId,
    question,
    category: toCategory(market),
    yesPrice: outcomePrices[resolvedYesIndex] ?? 0,
    noPrice: outcomePrices[resolvedNoIndex] ?? 0,
    liquidityUsd: toNumber(market.liquidityNum ?? market.liquidity),
    updatedAt: market.updatedAt ?? nowIso(),
    slug: market.slug ?? conditionId,
    icon: market.icon ?? null,
    endDate: market.endDate ?? market.endDateIso ?? null,
    yesTokenId: tokenIds[resolvedYesIndex] ?? tokenIds[0],
    noTokenId: tokenIds[resolvedNoIndex] ?? tokenIds[1],
    orderBookEnabled: market.enableOrderBook ?? true,
    negRisk: market.negRisk ?? false
  };
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

const fetchLiveMarkets = async (): Promise<{ curated: Market[]; all: Market[] }> => {
  const requestLimit = Math.min(Math.max(env.polymarketMarketLimit * 6, env.polymarketMarketLimit), 240);
  const params = new URLSearchParams({
    limit: String(requestLimit),
    active: "true",
    closed: "false",
    archived: "false",
    order: "volume",
    ascending: "false"
  });

  const rawMarkets = await fetchJson<RawGammaMarket[]>(`${env.polymarketGammaHost}/markets?${params.toString()}`);

  const normalizedMarkets = rawMarkets
    .map(normalizeMarket)
    .filter((market): market is Market => Boolean(market))
    .filter((market) => market.orderBookEnabled);

  return curateMarkets(normalizedMarkets);
};

const getSeedMarkets = async (): Promise<Market[]> => {
  const store = getStore();
  return store.listMarkets();
};

export const listMarkets = async (): Promise<Market[]> => {
  if (env.polymarketMarketSource === "seed") {
    return getSeedMarkets();
  }

  if (marketCache && marketCache.expiresAt > Date.now()) {
    return marketCache.markets;
  }

  try {
    const liveMarkets = await fetchLiveMarkets();
    marketCache = {
      markets: liveMarkets.curated,
      allMarkets: liveMarkets.all,
      expiresAt: Date.now() + env.polymarketMarketCacheTtlMs
    };
    return liveMarkets.curated;
  } catch {
    return marketCache?.markets ?? [];
  }
};

export const getMarketById = async (marketId: string): Promise<Market | undefined> => {
  if (marketCache && marketCache.expiresAt > Date.now()) {
    return marketCache.allMarkets.find((market) => market.id === marketId);
  }

  const markets = await listMarkets();
  return marketCache?.allMarkets.find((market) => market.id === marketId) ?? markets.find((market) => market.id === marketId);
};

export const getPublicProfile = async (walletAddress: string): Promise<PolymarketPublicProfile> => {
  const params = new URLSearchParams({
    address: walletAddress.toLowerCase()
  });
  let profile: GammaProfileResponse;

  try {
    profile = await fetchJson<GammaProfileResponse>(
      `${env.polymarketGammaHost}/public-profile?${params.toString()}`
    );
  } catch {
    profile = {};
  }

  return {
    walletAddress: walletAddress.toLowerCase(),
    proxyWalletAddress: profile.proxyWallet?.toLowerCase() ?? null,
    username: profile.name ?? null,
    pseudonym: profile.pseudonym ?? null,
    profileImage: profile.profileImage ?? null
  };
};

export const clearMarketCache = (): void => {
  marketCache = null;
};

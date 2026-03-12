import { env } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import {
  GenerateMarketInsightInput,
  Market,
  MarketInsight,
  MarketInsightSource,
  MarketInsightTradeBias
} from "../domain/types.js";
import { createAuditLog } from "./auditService.js";
import { generateStructuredAiResponse, resolveProviderSelection } from "./aiProviderService.js";
import { getMarketById } from "./polymarketService.js";

interface RawInsightPayload {
  summary: string;
  fairProbabilityYes: number;
  confidence: number;
  tradeBias: MarketInsightTradeBias;
  timeHorizon: string;
  thesis: string;
  counterThesis: string;
  keyCatalysts: string[];
  riskFlags: string[];
  executionPlan: string[];
}

interface CachedInsight {
  expiresAt: number;
  insight: MarketInsight;
}

const cache = new Map<string, CachedInsight>();

const insightSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "fairProbabilityYes",
    "confidence",
    "tradeBias",
    "timeHorizon",
    "thesis",
    "counterThesis",
    "keyCatalysts",
    "riskFlags",
    "executionPlan"
  ],
  properties: {
    summary: { type: "string", minLength: 60, maxLength: 420 },
    fairProbabilityYes: { type: "number", minimum: 0, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    tradeBias: { type: "string", enum: ["buy_yes", "buy_no", "wait"] },
    timeHorizon: { type: "string", minLength: 3, maxLength: 120 },
    thesis: { type: "string", minLength: 40, maxLength: 500 },
    counterThesis: { type: "string", minLength: 40, maxLength: 500 },
    keyCatalysts: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", minLength: 8, maxLength: 160 }
    },
    riskFlags: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", minLength: 8, maxLength: 160 }
    },
    executionPlan: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", minLength: 8, maxLength: 180 }
    }
  }
} as const;

const clamp = (value: number, minimum: number, maximum: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
};

const toRounded = (value: number): number => Number(value.toFixed(2));

const normalizeList = (value: string[] | undefined, fallback: string[]): string[] => {
  const cleaned = (value ?? []).map((entry) => entry.trim()).filter(Boolean).slice(0, 5);
  return cleaned.length > 0 ? cleaned : fallback;
};

const resolveTradeBias = (
  requestedBias: MarketInsightTradeBias,
  marketProbabilityYes: number,
  fairProbabilityYes: number
): MarketInsightTradeBias => {
  const edge = fairProbabilityYes - marketProbabilityYes;

  if (Math.abs(edge) < 0.03) {
    return "wait";
  }

  if (requestedBias === "wait") {
    return edge > 0 ? "buy_yes" : "buy_no";
  }

  return requestedBias;
};

const buildPrompt = (market: Market, angle?: string): string => {
  return JSON.stringify(
    {
      task:
        "Analyze this Polymarket market as a disciplined trading analyst. Estimate fair YES probability, identify the edge versus market pricing, define the clearest risks, and recommend whether a trader should buy YES, buy NO, or wait.",
      constraints: [
        "Use the market snapshot plus grounded web results when available. Do not invent facts.",
        "If the information is too thin for a strong view, lower confidence and prefer wait.",
        "Confidence must reflect information quality, not optimism.",
        "Execution plan should be practical and brief."
      ],
      market: {
        question: market.question,
        category: market.category,
        subcategory: market.subcategory,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        liquidityUsd: market.liquidityUsd,
        orderBookEnabled: market.orderBookEnabled,
        negRisk: market.negRisk,
        endDate: market.endDate,
        updatedAt: market.updatedAt
      },
      analystAngle: angle?.trim() || null
    },
    null,
    2
  );
};

const toCacheKey = (input: GenerateMarketInsightInput, provider: string, model: string): string => {
  return [input.marketId, provider, model.toLowerCase(), input.angle?.trim().toLowerCase() ?? ""].join(":");
};

const normalizeInsight = (
  market: Market,
  raw: RawInsightPayload,
  sources: MarketInsightSource[],
  provider: MarketInsight["provider"],
  model: string,
  angle?: string
): MarketInsight => {
  const marketProbabilityYes = clamp(market.yesPrice, 0, 1, 0.5);
  const fairProbabilityYes = clamp(raw.fairProbabilityYes, 0, 1, marketProbabilityYes);
  const confidence = clamp(raw.confidence, 0, 1, 0.3);
  const tradeBias = resolveTradeBias(raw.tradeBias, marketProbabilityYes, fairProbabilityYes);

  return {
    marketId: market.id,
    marketQuestion: market.question,
    marketProbabilityYes: toRounded(marketProbabilityYes),
    fairProbabilityYes: toRounded(fairProbabilityYes),
    edgePercentagePoints: toRounded((fairProbabilityYes - marketProbabilityYes) * 100),
    confidence: toRounded(confidence),
    provider,
    tradeBias,
    timeHorizon: raw.timeHorizon.trim(),
    summary: raw.summary.trim(),
    thesis: raw.thesis.trim(),
    counterThesis: raw.counterThesis.trim(),
    keyCatalysts: normalizeList(raw.keyCatalysts, ["Liquidity and pricing signal are the main usable inputs."]),
    riskFlags: normalizeList(raw.riskFlags, ["Information quality is limited to the current market context."]),
    executionPlan: normalizeList(raw.executionPlan, ["Wait for a stronger edge before committing size."]),
    sources,
    disclaimer: "AI insight supports decision-making. It does not guarantee returns and should not be used without sizing discipline.",
    angle: angle?.trim() || undefined,
    model,
    generatedAt: new Date().toISOString()
  };
};

export const generateMarketInsight = async (input: GenerateMarketInsightInput): Promise<MarketInsight> => {
  const market = await getMarketById(input.marketId);

  if (!market) {
    throw new AppError("Market not found for insight generation.", 404);
  }

  const selection = resolveProviderSelection({ provider: input.provider, model: input.model });
  const cacheKey = toCacheKey(input, selection.provider, selection.model);
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.insight;
  }

  const generated = await generateStructuredAiResponse<RawInsightPayload>({
    provider: selection.provider,
    model: selection.model,
    systemPrompt:
      "You are a prediction-market analyst for EdgeMarkets. Be conservative, quantify uncertainty, and prefer wait when the edge is weak.",
    userPrompt: buildPrompt(market, input.angle),
    schema: insightSchema
  });

  const insight = normalizeInsight(
    market,
    generated.payload,
    generated.sources,
    generated.selection.provider,
    generated.selection.model,
    input.angle
  );

  cache.set(cacheKey, {
    insight,
    expiresAt: Date.now() + env.aiInsightCacheTtlMs
  });

  await createAuditLog({
    action: "market_insight.generated",
    actorType: "system",
    actorId: "ai",
    entityType: "market_insight",
    entityId: market.id,
    metadata: {
      marketId: market.id,
      provider: insight.provider,
      model: insight.model,
      tradeBias: insight.tradeBias,
      confidence: insight.confidence,
      edgePercentagePoints: insight.edgePercentagePoints,
      angle: insight.angle ?? null
    }
  });

  return insight;
};

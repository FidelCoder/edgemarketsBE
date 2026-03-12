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
import { getMarketById } from "./polymarketService.js";

interface OpenAiResponseShape {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

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

interface WebSourceCandidate {
  title?: unknown;
  url?: unknown;
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
    summary: {
      type: "string",
      minLength: 60,
      maxLength: 420
    },
    fairProbabilityYes: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    tradeBias: {
      type: "string",
      enum: ["buy_yes", "buy_no", "wait"]
    },
    timeHorizon: {
      type: "string",
      minLength: 3,
      maxLength: 120
    },
    thesis: {
      type: "string",
      minLength: 40,
      maxLength: 500
    },
    counterThesis: {
      type: "string",
      minLength: 40,
      maxLength: 500
    },
    keyCatalysts: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 8,
        maxLength: 160
      }
    },
    riskFlags: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 8,
        maxLength: 160
      }
    },
    executionPlan: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "string",
        minLength: 8,
        maxLength: 180
      }
    }
  }
} as const;

const buildPrompt = (market: Market, angle?: string): string => {
  const prompt = {
    task:
      "Analyze this Polymarket market as a disciplined trading analyst. Estimate fair YES probability, identify the edge versus market pricing, define the clearest risks, and recommend whether a trader should buy YES, buy NO, or wait.",
    constraints: [
      env.openAiWebSearchEnabled
        ? "Use the provided market snapshot plus grounded web results if available. Do not invent facts."
        : "Use only the market snapshot provided here. Do not invent external facts or sources.",
      "If the snapshot is too thin for a strong view, lower confidence and prefer wait.",
      "Confidence must reflect information quality, not optimism.",
      "Execution plan should be practical and brief."
    ],
    market: {
      question: market.question,
      category: market.category,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      liquidityUsd: market.liquidityUsd,
      orderBookEnabled: market.orderBookEnabled,
      negRisk: market.negRisk,
      endDate: market.endDate,
      updatedAt: market.updatedAt
    },
    analystAngle: angle?.trim() || null
  };

  return JSON.stringify(prompt, null, 2);
};

const getOutputText = (response: OpenAiResponseShape): string => {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const contentText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (contentText) {
    return contentText;
  }

  throw new AppError("AI provider returned an empty insight response.", 502);
};

const clamp = (value: number, minimum: number, maximum: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, value));
};

const toRounded = (value: number): number => {
  return Number(value.toFixed(2));
};

const normalizeList = (value: string[] | undefined, fallback: string[]): string[] => {
  const cleaned = (value ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 5);

  return cleaned.length > 0 ? cleaned : fallback;
};

const extractSources = (value: unknown): MarketInsightSource[] => {
  const discovered = new Map<string, MarketInsightSource>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const candidate = node as WebSourceCandidate;

    if (typeof candidate.url === "string" && candidate.url.startsWith("http")) {
      const normalizedUrl = candidate.url.trim();
      const normalizedTitle =
        typeof candidate.title === "string" && candidate.title.trim().length > 0
          ? candidate.title.trim()
          : normalizedUrl;

      discovered.set(normalizedUrl, {
        title: normalizedTitle,
        url: normalizedUrl
      });
    }

    Object.values(node).forEach(visit);
  };

  visit(value);
  return Array.from(discovered.values()).slice(0, 6);
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

const toCacheKey = ({ marketId, angle }: GenerateMarketInsightInput): string => {
  return `${marketId}:${angle?.trim().toLowerCase() ?? ""}`;
};

const createResponsePayload = async (
  market: Market,
  angle?: string
): Promise<{ payload: RawInsightPayload; sources: MarketInsightSource[] }> => {
  if (!env.openAiApiKey) {
    throw new AppError("AI provider is not configured. Set OPENAI_API_KEY on the backend.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openAiTimeoutMs);

  try {
    const response = await fetch(`${env.openAiBaseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.openAiModel,
        tools: env.openAiWebSearchEnabled ? [{ type: "web_search" }] : undefined,
        include: env.openAiWebSearchEnabled ? ["web_search_call.action.sources"] : undefined,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a prediction-market analyst for EdgeMarkets. Be conservative, quantify uncertainty, and prefer 'wait' when the edge is weak."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(market, angle)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "market_insight",
            strict: true,
            schema: insightSchema
          }
        }
      })
    });

    const rawBody = (await response.json()) as OpenAiResponseShape;

    if (!response.ok) {
      throw new AppError(rawBody.error?.message ?? "AI provider request failed.", 502);
    }

    return {
      payload: JSON.parse(getOutputText(rawBody)) as RawInsightPayload,
      sources: extractSources(rawBody)
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if ((error as { name?: string } | null)?.name === "AbortError") {
      throw new AppError("AI insight generation timed out.", 504);
    }

    throw new AppError(error instanceof Error ? error.message : "AI insight generation failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeInsight = (
  market: Market,
  raw: RawInsightPayload,
  sources: MarketInsightSource[],
  angle?: string
): MarketInsight => {
  const marketProbabilityYes = clamp(market.yesPrice, 0, 1, 0.5);
  const fairProbabilityYes = clamp(raw.fairProbabilityYes, 0, 1, marketProbabilityYes);
  const confidence = clamp(raw.confidence, 0, 1, 0.3);
  const tradeBias = resolveTradeBias(raw.tradeBias, marketProbabilityYes, fairProbabilityYes);
  const edgePercentagePoints = toRounded((fairProbabilityYes - marketProbabilityYes) * 100);

  return {
    marketId: market.id,
    marketQuestion: market.question,
    marketProbabilityYes: toRounded(marketProbabilityYes),
    fairProbabilityYes: toRounded(fairProbabilityYes),
    edgePercentagePoints,
    confidence: toRounded(confidence),
    tradeBias,
    timeHorizon: raw.timeHorizon.trim(),
    summary: raw.summary.trim(),
    thesis: raw.thesis.trim(),
    counterThesis: raw.counterThesis.trim(),
    keyCatalysts: normalizeList(raw.keyCatalysts, ["Liquidity and pricing signal are the main usable inputs."]),
    riskFlags: normalizeList(raw.riskFlags, ["Information quality is limited to market metadata."]),
    executionPlan: normalizeList(raw.executionPlan, ["Wait for a stronger edge before committing size."]),
    sources,
    disclaimer: "AI insight supports decision-making. It does not guarantee returns and should not be used without sizing discipline.",
    angle: angle?.trim() || undefined,
    model: env.openAiModel,
    generatedAt: new Date().toISOString()
  };
};

export const generateMarketInsight = async (input: GenerateMarketInsightInput): Promise<MarketInsight> => {
  const market = await getMarketById(input.marketId);

  if (!market) {
    throw new AppError("Market not found for insight generation.", 404);
  }

  const cacheKey = toCacheKey(input);
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.insight;
  }

  const rawInsight = await createResponsePayload(market, input.angle);
  const insight = normalizeInsight(market, rawInsight.payload, rawInsight.sources, input.angle);

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
      tradeBias: insight.tradeBias,
      confidence: insight.confidence,
      edgePercentagePoints: insight.edgePercentagePoints,
      angle: insight.angle ?? null
    }
  });

  return insight;
};

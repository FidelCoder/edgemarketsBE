import { AppError } from "../domain/errors.js";
import {
  ActionType,
  AutomationPlan,
  AutomationPlanLeg,
  GenerateAutomationPlanInput,
  Market,
  MarketInsightSource
} from "../domain/types.js";
import { createAuditLog } from "./auditService.js";
import { generateStructuredAiResponse } from "./aiProviderService.js";
import { listMarkets } from "./polymarketService.js";

interface RawAutomationLeg {
  marketId: string;
  action: ActionType;
  allocationUsd: number;
  fairProbabilityYes: number;
  conviction: number;
  rationale: string;
  riskNote: string;
  maxHoldingHours: number;
  stopLossProbability: number;
  takeProfitProbability: number;
}

interface RawAutomationPlan {
  summary: string;
  compoundingNote: string;
  reviewPlan: string[];
  safeguards: string[];
  legs: RawAutomationLeg[];
}

const automationPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "compoundingNote", "reviewPlan", "safeguards", "legs"],
  properties: {
    summary: { type: "string", minLength: 60, maxLength: 420 },
    compoundingNote: { type: "string", minLength: 30, maxLength: 260 },
    reviewPlan: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string", minLength: 10, maxLength: 140 }
    },
    safeguards: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string", minLength: 10, maxLength: 160 }
    },
    legs: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "marketId",
          "action",
          "allocationUsd",
          "fairProbabilityYes",
          "conviction",
          "rationale",
          "riskNote",
          "maxHoldingHours",
          "stopLossProbability",
          "takeProfitProbability"
        ],
        properties: {
          marketId: { type: "string", minLength: 2 },
          action: { type: "string", enum: ["buy_yes", "buy_no"] },
          allocationUsd: { type: "number", minimum: 25, maximum: 1000000 },
          fairProbabilityYes: { type: "number", minimum: 0, maximum: 1 },
          conviction: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string", minLength: 20, maxLength: 220 },
          riskNote: { type: "string", minLength: 15, maxLength: 180 },
          maxHoldingHours: { type: "number", minimum: 4, maximum: 720 },
          stopLossProbability: { type: "number", minimum: 0, maximum: 1 },
          takeProfitProbability: { type: "number", minimum: 0, maximum: 1 }
        }
      }
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

const normalizeTextList = (value: string[] | undefined, fallback: string[]): string[] => {
  const cleaned = (value ?? []).map((entry) => entry.trim()).filter(Boolean).slice(0, 6);
  return cleaned.length > 0 ? cleaned : fallback;
};

const scoreCandidateMarket = (market: Market): number => {
  const balanceScore = 1 - Math.abs(market.yesPrice - 0.5) * 1.4;
  const bookBonus = market.orderBookEnabled ? 1.15 : 0.7;
  return balanceScore * Math.log10(Math.max(market.liquidityUsd, 1)) * bookBonus;
};

const pickCandidateMarkets = async (input: GenerateAutomationPlanInput): Promise<Market[]> => {
  const liveMarkets = await listMarkets();
  const categoryFilter = new Set((input.preferredCategories ?? []).map((entry) => entry.toLowerCase()));
  const filtered = liveMarkets.filter((market) => {
    if (categoryFilter.size === 0) {
      return true;
    }

    return categoryFilter.has(market.category.toLowerCase()) || categoryFilter.has(market.subcategory.toLowerCase());
  });
  const source = filtered.length >= input.maxPositions ? filtered : liveMarkets;

  return [...source]
    .filter((market) => market.orderBookEnabled)
    .sort((left, right) => scoreCandidateMarket(right) - scoreCandidateMarket(left))
    .slice(0, Math.max(input.maxPositions * 3, 10));
};

const buildPrompt = (input: GenerateAutomationPlanInput, candidateMarkets: Market[]): string => {
  return JSON.stringify(
    {
      task:
        "Build a multi-market prediction trading plan that allocates capital across the best liquid opportunities, respects strict drawdown rules, and compounds cautiously over the requested horizon.",
      hardRules: [
        "Only use the candidate markets provided.",
        "Only recommend buy_yes or buy_no, never leverage.",
        "Do not allocate more than the deployable bankroll.",
        "Prefer liquid markets and avoid over-clustering risk in one theme.",
        "Compounding must be cautious and subordinated to drawdown limits."
      ],
      bankroll: {
        totalUsd: input.bankrollUsd,
        deployableUsd: input.bankrollUsd * (1 - input.reserveRatio),
        reserveUsd: input.bankrollUsd * input.reserveRatio,
        targetReturnPct: input.targetReturnPct,
        timeHorizonDays: input.timeHorizonDays,
        profitReinvestmentPct: input.profitReinvestmentPct,
        rebalanceIntervalHours: input.rebalanceIntervalHours
      },
      haltRules: {
        maxDrawdownPct: input.maxDrawdownPct,
        dailyLossLimitUsd: input.dailyLossLimitUsd,
        maxConsecutiveLosses: input.maxConsecutiveLosses,
        maxPositions: input.maxPositions
      },
      userObjective: input.objective?.trim() || null,
      preferredCategories: input.preferredCategories ?? [],
      candidateMarkets: candidateMarkets.map((market) => ({
        marketId: market.id,
        question: market.question,
        category: market.category,
        subcategory: market.subcategory,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        liquidityUsd: market.liquidityUsd,
        negRisk: market.negRisk,
        endDate: market.endDate,
        updatedAt: market.updatedAt
      }))
    },
    null,
    2
  );
};

const normalizeLegs = (
  rawLegs: RawAutomationLeg[],
  candidateMarkets: Market[],
  input: GenerateAutomationPlanInput
): AutomationPlanLeg[] => {
  const marketMap = new Map(candidateMarkets.map((market) => [market.id, market]));
  const uniqueLegs = rawLegs.filter((leg, index, source) => {
    return source.findIndex((entry) => entry.marketId === leg.marketId) === index;
  });
  const selectedLegs = uniqueLegs
    .map((leg) => {
      const market = marketMap.get(leg.marketId);
      if (!market) {
        return null;
      }

      return { market, leg };
    })
    .filter((entry): entry is { market: Market; leg: RawAutomationLeg } => Boolean(entry))
    .slice(0, input.maxPositions);

  if (selectedLegs.length === 0) {
    throw new AppError("AI portfolio plan did not return usable market legs.", 502);
  }

  const deployableUsd = input.bankrollUsd * (1 - input.reserveRatio);
  const totalRequested = selectedLegs.reduce((sum, entry) => sum + Math.max(entry.leg.allocationUsd, 25), 0);
  const scalingFactor = totalRequested > 0 ? deployableUsd / totalRequested : 1;

  return selectedLegs.map(({ market, leg }) => ({
    marketId: market.id,
    question: market.question,
    category: market.category,
    subcategory: market.subcategory,
    action: leg.action === "buy_no" ? "buy_no" : "buy_yes",
    allocationUsd: toRounded(Math.max(25, leg.allocationUsd) * scalingFactor),
    marketProbabilityYes: toRounded(market.yesPrice),
    fairProbabilityYes: toRounded(clamp(leg.fairProbabilityYes, 0, 1, market.yesPrice)),
    conviction: toRounded(clamp(leg.conviction, 0, 1, 0.4)),
    rationale: leg.rationale.trim(),
    riskNote: leg.riskNote.trim(),
    maxHoldingHours: Math.round(clamp(leg.maxHoldingHours, 4, 720, 48)),
    stopLossProbability: toRounded(clamp(leg.stopLossProbability, 0, 1, market.yesPrice)),
    takeProfitProbability: toRounded(clamp(leg.takeProfitProbability, 0, 1, market.yesPrice))
  }));
};

export const generateAutomationPlan = async (input: GenerateAutomationPlanInput): Promise<AutomationPlan> => {
  const candidateMarkets = await pickCandidateMarkets(input);

  if (candidateMarkets.length === 0) {
    throw new AppError("No candidate markets are available for automation planning.", 503);
  }

  const generated = await generateStructuredAiResponse<RawAutomationPlan>({
    provider: input.provider,
    model: input.model,
    systemPrompt:
      "You are the EdgeMarkets portfolio agent. Build cautious, high-discipline prediction market allocation plans. Respect loss limits first, only then pursue compounding.",
    userPrompt: buildPrompt(input, candidateMarkets),
    schema: automationPlanSchema
  });

  const legs = normalizeLegs(generated.payload.legs, candidateMarkets, input);
  const allocatedUsd = legs.reduce((sum, leg) => sum + leg.allocationUsd, 0);
  const reserveUsd = toRounded(Math.max(input.bankrollUsd - allocatedUsd, 0));
  const sources: MarketInsightSource[] = generated.sources.slice(0, 8);

  const plan: AutomationPlan = {
    bankrollUsd: toRounded(input.bankrollUsd),
    deployableUsd: toRounded(allocatedUsd),
    reserveUsd,
    targetReturnPct: toRounded(input.targetReturnPct),
    timeHorizonDays: input.timeHorizonDays,
    rebalanceIntervalHours: input.rebalanceIntervalHours,
    profitReinvestmentPct: toRounded(input.profitReinvestmentPct),
    haltRules: {
      maxDrawdownPct: toRounded(input.maxDrawdownPct),
      dailyLossLimitUsd: toRounded(input.dailyLossLimitUsd),
      maxConsecutiveLosses: input.maxConsecutiveLosses
    },
    summary: generated.payload.summary.trim(),
    compoundingNote: generated.payload.compoundingNote.trim(),
    reviewPlan: normalizeTextList(generated.payload.reviewPlan, ["Review open positions at each rebalance interval."]),
    safeguards: normalizeTextList(generated.payload.safeguards, ["Halt new entries immediately if drawdown rules are breached."]),
    provider: generated.selection.provider,
    model: generated.selection.model,
    objective: input.objective?.trim() || undefined,
    legs,
    sources,
    generatedAt: new Date().toISOString()
  };

  await createAuditLog({
    action: "automation_plan.generated",
    actorType: "system",
    actorId: "ai",
    entityType: "market_insight",
    entityId: candidateMarkets[0]?.id,
    metadata: {
      provider: plan.provider,
      model: plan.model,
      bankrollUsd: plan.bankrollUsd,
      deployableUsd: plan.deployableUsd,
      reserveUsd: plan.reserveUsd,
      legs: plan.legs.length,
      preferredCategories: input.preferredCategories ?? [],
      objective: plan.objective ?? null
    }
  });

  return plan;
};

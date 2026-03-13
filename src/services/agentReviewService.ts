import { AgentReviewDecision, AgentReviewRecord, AgentReviewSummary } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { isWithinDateRange, toDateRangeBounds } from "./analyticsDateRange.js";
import { toCsv } from "./csvExportService.js";

interface AgentReviewFilters {
  decision?: AgentReviewDecision;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

const filterReviews = (reviews: AgentReviewRecord[], filters: AgentReviewFilters): AgentReviewRecord[] => {
  const bounds = toDateRangeBounds(filters);

  return reviews
    .filter((review) => !filters.decision || review.decision === filters.decision)
    .filter((review) => isWithinDateRange(review.reviewedAt, bounds))
    .slice(0, filters.limit ?? 20);
};

export const listUserAgentReviews = async (
  userId: string,
  filters: AgentReviewFilters = {}
): Promise<AgentReviewRecord[]> => {
  const store = getStore();
  const reviews = await store.listAgentReviews({ userId, limit: 5000 });
  return filterReviews(reviews, filters);
};

export const getUserAgentReviewSummary = async (
  userId: string,
  filters: Pick<AgentReviewFilters, "decision" | "dateFrom" | "dateTo"> = {}
): Promise<AgentReviewSummary> => {
  const store = getStore();
  const reviews = filterReviews(await store.listAgentReviews({ userId, limit: 5000 }), { ...filters, limit: 5000 });
  const holdDecisions = reviews.filter((review) => review.decision === "hold").length;
  const haltDecisions = reviews.filter((review) => review.decision === "halt").length;
  const averageDrawdownPct =
    reviews.length > 0
      ? Number((reviews.reduce((sum, review) => sum + review.evaluation.drawdownPct, 0) / reviews.length).toFixed(2))
      : 0;
  const averageDayPnlUsd =
    reviews.length > 0
      ? Number((reviews.reduce((sum, review) => sum + review.evaluation.dayPnlUsd, 0) / reviews.length).toFixed(2))
      : 0;

  return {
    userId,
    totalReviews: reviews.length,
    holdDecisions,
    haltDecisions,
    haltRate: reviews.length > 0 ? Number((haltDecisions / reviews.length).toFixed(4)) : 0,
    averageDrawdownPct,
    averageDayPnlUsd,
    latestReviewedAt: reviews[0]?.reviewedAt
  };
};

export const exportUserAgentReviewsCsv = async (
  userId: string,
  filters: AgentReviewFilters = {}
): Promise<string> => {
  const reviews = await listUserAgentReviews(userId, { ...filters, limit: 5000 });

  return toCsv(
    [
      "reviewedAt",
      "decision",
      "reason",
      "effectiveBankrollUsd",
      "dayPnlUsd",
      "drawdownPct",
      "realizedPnlUsd",
      "markToMarketPnlUsd",
      "consecutiveLosses",
      "executedOrderCount",
      "executedMarketCount"
    ],
    reviews.map((review) => [
      review.reviewedAt,
      review.decision,
      review.reason ?? "",
      review.evaluation.effectiveBankrollUsd,
      review.evaluation.dayPnlUsd,
      review.evaluation.drawdownPct,
      review.evaluation.realizedPnlUsd,
      review.evaluation.markToMarketPnlUsd,
      review.evaluation.consecutiveLosses,
      review.executedOrderCount,
      review.executedMarketCount
    ])
  );
};

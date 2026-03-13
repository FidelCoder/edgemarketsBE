import { AgentReviewDecision, AgentReviewRecord, AgentReviewSummary } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";

export const listUserAgentReviews = async (
  userId: string,
  limit = 20,
  decision?: AgentReviewDecision
): Promise<AgentReviewRecord[]> => {
  const store = getStore();
  return store.listAgentReviews({ userId, decision, limit });
};

export const getUserAgentReviewSummary = async (userId: string): Promise<AgentReviewSummary> => {
  const store = getStore();
  const reviews = await store.listAgentReviews({ userId, limit: 5000 });
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

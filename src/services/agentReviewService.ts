import { AgentReviewRecord } from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";

export const listUserAgentReviews = async (
  userId: string,
  limit = 20
): Promise<AgentReviewRecord[]> => {
  const store = getStore();
  return store.listAgentReviews({ userId, limit });
};

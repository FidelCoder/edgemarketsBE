import { AppError } from "../domain/errors.js";
import {
  CreateStrategyInput,
  Follow,
  FollowStrategyInput,
  Strategy,
  StrategyWithMarket
} from "../domain/types.js";
import { getStore } from "../repositories/storeProvider.js";
import { createAuditLog } from "./auditService.js";

const enrichStrategies = async (strategies: Strategy[]): Promise<StrategyWithMarket[]> => {
  const store = getStore();

  return Promise.all(
    strategies.map(async (strategy) => {
      const market = await store.getMarketById(strategy.marketId);

      if (!market) {
        throw new AppError(`Market not found for strategy ${strategy.id}.`, 500);
      }

      return {
        ...strategy,
        market
      };
    })
  );
};

export const listStrategies = async (): Promise<StrategyWithMarket[]> => {
  const store = getStore();
  const strategies = await store.listStrategies();

  return enrichStrategies(strategies);
};

export const createStrategy = async (payload: CreateStrategyInput): Promise<StrategyWithMarket> => {
  const store = getStore();
  const market = await store.getMarketById(payload.marketId);

  if (!market) {
    throw new AppError("The selected market does not exist.", 404);
  }

  const created = await store.createStrategy(payload);
  await createAuditLog({
    action: "strategy.created",
    actorType: "user",
    actorId: payload.creatorHandle,
    entityType: "strategy",
    entityId: created.id,
    metadata: {
      marketId: payload.marketId,
      triggerType: payload.triggerType,
      action: payload.action,
      allocationUsd: payload.allocationUsd
    }
  });

  return {
    ...created,
    market
  };
};

export const followStrategy = async (
  strategyId: string,
  payload: FollowStrategyInput
): Promise<{ follow: Follow; strategy: StrategyWithMarket }> => {
  const store = getStore();
  const strategy = await store.getStrategyById(strategyId);

  if (!strategy) {
    throw new AppError("Strategy not found.", 404);
  }

  const existingFollow = await store.getFollowByUserAndStrategy(payload.userId, strategyId);

  if (existingFollow) {
    throw new AppError("You already follow this strategy.", 409);
  }

  let follow: Follow;

  try {
    follow = await store.createFollow({
      ...payload,
      strategyId
    });
  } catch (error) {
    const mongoCode = (error as { code?: number } | null)?.code;

    if (mongoCode === 11000) {
      throw new AppError("You already follow this strategy.", 409);
    }

    throw error;
  }

  await createAuditLog({
    action: "follow.created",
    actorType: "user",
    actorId: payload.userId,
    entityType: "follow",
    entityId: follow.id,
    metadata: {
      strategyId,
      fundingStablecoin: payload.fundingStablecoin,
      maxDailyLossUsd: payload.maxDailyLossUsd,
      maxMarketExposureUsd: payload.maxMarketExposureUsd
    }
  });

  const updatedStrategy = await store.getStrategyById(strategyId);
  const market = await store.getMarketById(strategy.marketId);

  if (!updatedStrategy || !market) {
    throw new AppError("Could not load updated strategy after follow.", 500);
  }

  return {
    follow,
    strategy: {
      ...updatedStrategy,
      market
    }
  };
};

export const listUserFollows = async (
  userId: string
): Promise<Array<Follow & { strategy: StrategyWithMarket }>> => {
  const store = getStore();
  const follows = await store.listFollowsByUser(userId);
  const strategies = await listStrategies();

  return follows
    .map((follow) => {
      const strategy = strategies.find((item) => item.id === follow.strategyId);

      if (!strategy) {
        return null;
      }

      return {
        ...follow,
        strategy
      };
    })
    .filter((entry): entry is Follow & { strategy: StrategyWithMarket } => Boolean(entry));
};

import {
  Market,
  StablecoinAsset,
  Strategy
} from "../domain/types.js";

const nowIso = (): string => new Date().toISOString();

export const createSeedMarkets = (): Market[] => [
  {
    id: "market-us-election-2028",
    question: "Will the Democratic nominee win the 2028 US Presidential Election?",
    category: "Politics",
    yesPrice: 0.47,
    noPrice: 0.53,
    liquidityUsd: 2400000,
    updatedAt: nowIso()
  },
  {
    id: "market-fed-cut-june-2026",
    question: "Will the Fed cut rates before July 2026?",
    category: "Macro",
    yesPrice: 0.63,
    noPrice: 0.37,
    liquidityUsd: 1800000,
    updatedAt: nowIso()
  },
  {
    id: "market-btc-100k-2026",
    question: "Will BTC touch $100k before Dec 31, 2026?",
    category: "Crypto",
    yesPrice: 0.41,
    noPrice: 0.59,
    liquidityUsd: 1200000,
    updatedAt: nowIso()
  }
];

export const createSeedStrategies = (): Strategy[] => [
  {
    id: "strategy-macro-dip-buyer",
    name: "Macro Dip Buyer",
    description: "Buys YES on Fed cut when implied probability drops below 58%.",
    marketId: "market-fed-cut-june-2026",
    triggerType: "price_below",
    conditionValue: 0.58,
    action: "buy_yes",
    allocationUsd: 500,
    creatorHandle: "edgemarkets",
    followerCount: 14,
    createdAt: nowIso()
  },
  {
    id: "strategy-btc-breakout",
    name: "BTC Breakout Momentum",
    description: "Buys YES on BTC 100k if odds break above 45% with sustained momentum.",
    marketId: "market-btc-100k-2026",
    triggerType: "price_above",
    conditionValue: 0.45,
    action: "buy_yes",
    allocationUsd: 750,
    creatorHandle: "quantnairobi",
    followerCount: 9,
    createdAt: nowIso()
  }
];

export const createSeedStablecoins = (): StablecoinAsset[] => [
  {
    symbol: "USDC",
    chain: "Polygon",
    settlementAsset: "USDC",
    conversionRequired: false
  },
  {
    symbol: "USDT",
    chain: "Polygon",
    settlementAsset: "USDC",
    conversionRequired: true
  },
  {
    symbol: "DAI",
    chain: "Polygon",
    settlementAsset: "USDC",
    conversionRequired: true
  }
];

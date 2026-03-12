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
    subcategory: "US Elections",
    yesPrice: 0.47,
    noPrice: 0.53,
    liquidityUsd: 2400000,
    updatedAt: nowIso(),
    slug: "democrat-win-2028-presidential-election",
    icon: null,
    endDate: null,
    yesTokenId: "seed_yes_market_us_election_2028",
    noTokenId: "seed_no_market_us_election_2028",
    orderBookEnabled: false,
    negRisk: false
  },
  {
    id: "market-fed-cut-june-2026",
    question: "Will the Fed cut rates before July 2026?",
    category: "Macro",
    subcategory: "Fed & Rates",
    yesPrice: 0.63,
    noPrice: 0.37,
    liquidityUsd: 1800000,
    updatedAt: nowIso(),
    slug: "fed-cut-before-july-2026",
    icon: null,
    endDate: null,
    yesTokenId: "seed_yes_market_fed_cut_june_2026",
    noTokenId: "seed_no_market_fed_cut_june_2026",
    orderBookEnabled: false,
    negRisk: false
  },
  {
    id: "market-btc-100k-2026",
    question: "Will BTC touch $100k before Dec 31, 2026?",
    category: "Crypto",
    subcategory: "Bitcoin",
    yesPrice: 0.41,
    noPrice: 0.59,
    liquidityUsd: 1200000,
    updatedAt: nowIso(),
    slug: "btc-touch-100k-before-dec-31-2026",
    icon: null,
    endDate: null,
    yesTokenId: "seed_yes_market_btc_100k_2026",
    noTokenId: "seed_no_market_btc_100k_2026",
    orderBookEnabled: false,
    negRisk: false
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

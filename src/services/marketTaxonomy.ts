interface TaxonomyInput {
  rawCategory?: string;
  question: string;
  tags?: string[];
}

interface TaxonomyResult {
  category: string;
  subcategory: string;
}

const normalize = (value: string): string => value.toLowerCase();

const hasAny = (value: string, patterns: RegExp[]): boolean => {
  return patterns.some((pattern) => pattern.test(value));
};

const detectSportsSubcategory = (value: string): string => {
  if (/\b(nba|basketball|finals|eastern conference|western conference)\b/.test(value)) {
    return "Basketball";
  }

  if (/\b(fifa|world cup|la liga|premier league|mls|fc\b|calcio|soccer|football club)\b/.test(value)) {
    return "Soccer";
  }

  if (/\b(nfl|super bowl|touchdown|afc|nfc)\b/.test(value)) {
    return "American Football";
  }

  if (/\b(mlb|world series|baseball|mariners)\b/.test(value)) {
    return "Baseball";
  }

  if (/\b(nhl|stanley cup|hockey)\b/.test(value)) {
    return "Hockey";
  }

  if (/\b(tennis|atp|wta|paribas open|grand slam)\b/.test(value)) {
    return "Tennis";
  }

  if (/\b(f1|formula 1|drivers' champion|grand prix)\b/.test(value)) {
    return "Motorsport";
  }

  if (/\b(counter-strike|cs2|esports|bo3|dota|league of legends|valorant)\b/.test(value)) {
    return "Esports";
  }

  if (/\b(ufc|boxing|mma)\b/.test(value)) {
    return "Combat Sports";
  }

  return "Other Sports";
};

const detectPoliticsSubcategory = (value: string): string => {
  if (/\b(2028|2026|2024|election|nomination|president|senate|house|republican|democratic|democrat)\b/.test(value)) {
    return "US Elections";
  }

  if (/\b(kennedy|trump|biden|rfk|mark kelly)\b/.test(value)) {
    return "US Elections";
  }

  if (/\b(scotus|congress|government|policy|bill|tax|white house)\b/.test(value)) {
    return "US Policy";
  }

  return "Politics";
};

const detectWorldSubcategory = (value: string): string => {
  if (/\b(iran|israel|ukraine|russia|nuclear|war|peace deal|ceasefire|uranium)\b/.test(value)) {
    return "Geopolitics";
  }

  if (/\b(world cup|eu|un|china|africa|curaçao|global)\b/.test(value)) {
    return "Global Events";
  }

  return "World Events";
};

const detectCryptoSubcategory = (value: string): string => {
  if (/\b(bitcoin|btc)\b/.test(value)) {
    return "Bitcoin";
  }

  if (/\b(ethereum|eth)\b/.test(value)) {
    return "Ethereum";
  }

  if (/\b(solana|xrp|doge|altcoin)\b/.test(value)) {
    return "Altcoins";
  }

  if (/\b(fdv|launch|token|airdrop|backpack|predict.fun)\b/.test(value)) {
    return "Token Launches";
  }

  return "Crypto Markets";
};

const detectMacroSubcategory = (value: string): string => {
  if (/\b(fed|rates|rate cut|rate hike)\b/.test(value)) {
    return "Fed & Rates";
  }

  if (/\b(cpi|inflation|pce)\b/.test(value)) {
    return "Inflation";
  }

  if (/\b(gdp|recession|jobless|unemployment|economy)\b/.test(value)) {
    return "Economic Data";
  }

  if (/\b(crude oil|oil|gold|silver|commodities)\b/.test(value)) {
    return "Commodities";
  }

  return "Macro";
};

const detectFinanceSubcategory = (value: string): string => {
  if (/\b(spread:|o\/u|over\/under)\b/.test(value)) {
    return "Spread Markets";
  }

  if (/\b(stock|nasdaq|s&p|dow|paribas)\b/.test(value)) {
    return "Equities";
  }

  return "Financial Markets";
};

export const inferMarketTaxonomy = ({ rawCategory, question, tags = [] }: TaxonomyInput): TaxonomyResult => {
  const category = normalize(rawCategory ?? "");
  const text = normalize([rawCategory, question, ...tags].filter(Boolean).join(" "));

  if (category.includes("sport") || hasAny(text, [/\bnba\b/, /\bfifa\b/, /\bmls\b/, /\bworld series\b/, /\bformula 1\b/, /\bcounter-strike\b/, /\bufc\b/])) {
    return {
      category: "Sports",
      subcategory: detectSportsSubcategory(text)
    };
  }

  if (category.includes("politic") || hasAny(text, [/\belection\b/, /\bpresident\b/, /\brepublican\b/, /\bdemocratic\b/, /\bsenate\b/])) {
    return {
      category: "Politics",
      subcategory: detectPoliticsSubcategory(text)
    };
  }

  if (hasAny(text, [/\biran\b/, /\bukraine\b/, /\brussia\b/, /\bgeopolitic\b/, /\bnuclear\b/, /\bglobal\b/])) {
    return {
      category: "World",
      subcategory: detectWorldSubcategory(text)
    };
  }

  if (category.includes("crypto") || hasAny(text, [/\bbitcoin\b/, /\beth\b/, /\bethereum\b/, /\bxrp\b/, /\bsolana\b/, /\bfdv\b/])) {
    return {
      category: "Crypto",
      subcategory: detectCryptoSubcategory(text)
    };
  }

  if (category.includes("econom") || category.includes("macro") || hasAny(text, [/\bfed\b/, /\bcpi\b/, /\binflation\b/, /\boil\b/, /\bgdp\b/])) {
    return {
      category: "Macro",
      subcategory: detectMacroSubcategory(text)
    };
  }

  if (category.includes("finance") || hasAny(text, [/\bspread:\b/, /\bo\/u\b/, /\bstock\b/, /\bnasdaq\b/, /\bs&p\b/])) {
    return {
      category: "Finance",
      subcategory: detectFinanceSubcategory(text)
    };
  }

  if (category.includes("weather") || hasAny(text, [/\btemperature\b/, /\brain\b/, /\bsnow\b/, /\bhurricane\b/, /\bweather\b/])) {
    return {
      category: "Weather",
      subcategory: "Forecasts"
    };
  }

  if (category.includes("tech") || hasAny(text, [/\bai\b/, /\bopenai\b/, /\btesla\b/, /\bnvidia\b/, /\bgoogle\b/, /\bapple\b/])) {
    return {
      category: "Tech",
      subcategory: "Technology"
    };
  }

  if (category.includes("culture") || hasAny(text, [/\bjesus christ\b/, /\bgta vi\b/, /\boscar\b/, /\bgrammy\b/, /\bcelebrity\b/])) {
    return {
      category: "Culture",
      subcategory: "Internet & Culture"
    };
  }

  return {
    category: "Events",
    subcategory: "General Events"
  };
};

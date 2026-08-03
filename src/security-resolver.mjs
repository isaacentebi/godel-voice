const securities = [
  { ticker: "AMZN", venue: "US", asset_class: "EQ", aliases: ["amazon", "amazon.com", "aws"] },
  { ticker: "AAPL", venue: "US", asset_class: "EQ", aliases: ["apple", "apple inc"] },
  { ticker: "MSFT", venue: "US", asset_class: "EQ", aliases: ["microsoft", "microsoft corporation"] },
  { ticker: "META", venue: "US", asset_class: "EQ", aliases: ["meta", "facebook", "meta platforms"] },
  { ticker: "NVDA", venue: "US", asset_class: "EQ", aliases: ["nvidia"] },
  { ticker: "TSLA", venue: "US", asset_class: "EQ", aliases: ["tesla"] },
  { ticker: "NFLX", venue: "US", asset_class: "EQ", aliases: ["netflix"] },
  { ticker: "ORCL", venue: "US", asset_class: "EQ", aliases: ["oracle"] },
  { ticker: "RDDT", venue: "US", asset_class: "EQ", aliases: ["reddit"] },
  { ticker: "PLTR", venue: "US", asset_class: "EQ", aliases: ["palantir"] }
];

const normalize = value => String(value ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
const byAlias = new Map(securities.flatMap(item => item.aliases.map(alias => [normalize(alias), item])));
const byTicker = new Map(securities.map(item => [item.ticker, item]));
const actionFeatures = new Set(["add company", "add/remove securities", "buy leg", "sell leg"]);

export function resolveCommonSecurities(intent) {
  if (!intent || typeof intent !== "object") return intent;
  const security = intent.security;
  if (security && typeof security === "object") {
    const known = byAlias.get(normalize(security.spoken_name)) ?? byTicker.get(String(security.ticker ?? "").toUpperCase());
    if (known) {
      security.ticker ??= known.ticker;
      security.venue ??= known.venue;
      security.asset_class ??= known.asset_class;
      security.needs_resolution = false;
    }
  }
  for (const action of intent.post_open_actions ?? []) {
    if (!actionFeatures.has(String(action.feature ?? "").toLowerCase())) continue;
    const known = byAlias.get(normalize(action.value)) ?? byTicker.get(String(action.value ?? "").toUpperCase());
    if (known) action.value = known.ticker;
  }
  return intent;
}

export const commonSecurities = securities;

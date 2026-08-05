const securities = [
  { ticker: "AMZN", venue: "US", asset_class: "EQ", aliases: ["amazon", "amazon.com", "amazon dot com", "aws"] },
  { ticker: "AAPL", venue: "US", asset_class: "EQ", aliases: ["apple", "apple inc", "apple computer"] },
  { ticker: "MSFT", venue: "US", asset_class: "EQ", aliases: ["microsoft", "microsoft corporation", "micro soft"] },
  { ticker: "META", venue: "US", asset_class: "EQ", aliases: ["meta", "facebook", "meta platforms", "face book"] },
  { ticker: "NVDA", venue: "US", asset_class: "EQ", aliases: ["nvidia", "n vidia"] },
  { ticker: "TSLA", venue: "US", asset_class: "EQ", aliases: ["tesla"] },
  { ticker: "NFLX", venue: "US", asset_class: "EQ", aliases: ["netflix"] },
  { ticker: "ORCL", venue: "US", asset_class: "EQ", aliases: ["oracle"] },
  { ticker: "RDDT", venue: "US", asset_class: "EQ", aliases: ["reddit"] },
  { ticker: "PLTR", venue: "US", asset_class: "EQ", aliases: ["palantir"] },
  { ticker: "BRK.B", venue: "US", asset_class: "EQ", aliases: ["berkshire", "berkshire hathaway", "berkshire class b"] },
  { ticker: "GOOG", venue: "US", asset_class: "EQ", aliases: ["alphabet", "google", "google parent"] },
  { ticker: "NOW", venue: "US", asset_class: "EQ", aliases: ["service now", "servicenow"], contextual_ticker: true },
  { ticker: "NVO", venue: "US", asset_class: "EQ", aliases: ["novo nordisk"] },
  { ticker: "LLY", venue: "US", asset_class: "EQ", aliases: ["eli lilly", "lilly"] },
  { ticker: "CMG", venue: "US", asset_class: "EQ", aliases: ["chipotle", "chipotle mexican grill"] },
  { ticker: "U", venue: "US", asset_class: "EQ", aliases: ["unity", "unity software"], contextual_aliases: ["unity"], contextual_ticker: true },
  { ticker: "CRSR", venue: "US", asset_class: "EQ", aliases: ["corsair", "corsair gaming"] },
  { ticker: "SNDK", venue: "US", asset_class: "EQ", aliases: ["sandisk", "san disk"] },
  { ticker: "KO", venue: "US", asset_class: "EQ", aliases: ["coca cola", "coca-cola"] },
  { ticker: "XYZ", venue: "US", asset_class: "EQ", aliases: ["block inc", "block", "square"], contextual_aliases: ["block", "square"] },
  { ticker: "BTCUSD", venue: "GBL", asset_class: "CRYPTO", aliases: ["bitcoin", "btc", "bitcoin usd"] },
  { ticker: "SPY", venue: "US", asset_class: "EQ", aliases: ["spy", "s p y"] },
  { ticker: "QQQ", venue: "US", asset_class: "EQ", aliases: ["qqq", "q q q"] },
  { ticker: "VIX", venue: "CBOE", asset_class: "IDX", aliases: ["vix", "volatility index", "cboe volatility index", "fear index"] }
];

const normalize = value => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .trim().toLowerCase().replace(/[’']s\b/g, "").replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const securityCue = /\b(?:stock|shares?|ticker|symbol|company|earnings?|chart|graph|price|quote|financials?|filings?|options?|holdings?|revenue|margin|valuation|multiple|ebitda|transcript|analyst|dividend|short interest)\b/;

function tickerAliases(item) {
  const compact = String(item.ticker).toLowerCase().replace(/[^a-z0-9]/g, "");
  const canonical = normalize(item.ticker);
  const aliases = [canonical, compact];
  if (/^[a-z]{2,6}$/.test(compact)) aliases.push([...compact].join(" "));
  return [...new Set(aliases.filter(Boolean))];
}

function transcriptAliases(item) {
  const contextual = new Set((item.contextual_aliases ?? []).map(normalize));
  const aliases = item.aliases.map(alias => ({ alias: normalize(alias), requiresCue: contextual.has(normalize(alias)), requiresExplicitTicker: false }));
  for (const alias of tickerAliases(item)) aliases.push({ alias, requiresCue: false, requiresExplicitTicker: item.contextual_ticker === true });
  return [...new Map(aliases.map(candidate => [candidate.alias, candidate])).values()];
}

const bySpoken = new Map(securities.flatMap(item => transcriptAliases(item).map(({ alias }) => [alias, item])));
const byTicker = new Map(securities.map(item => [item.ticker, item]));
const actionFeatures = new Set(["add company", "add/remove securities", "buy leg", "sell leg"]);

function knownFrom(value, ticker = null) {
  return bySpoken.get(normalize(value)) ?? byTicker.get(String(ticker ?? value ?? "").trim().toUpperCase());
}

export function resolveCommonSecurities(intent) {
  if (!intent || typeof intent !== "object") return intent;
  const security = intent.security;
  if (security && typeof security === "object") {
    const known = knownFrom(security.spoken_name, security.ticker);
    if (known) {
      security.ticker ??= known.ticker;
      security.venue ??= known.venue;
      security.asset_class ??= known.asset_class;
      security.needs_resolution = false;
    }
  }
  for (const action of intent.post_open_actions ?? []) {
    if (!actionFeatures.has(String(action.feature ?? "").toLowerCase())) continue;
    const known = knownFrom(action.value);
    if (known) action.value = known.ticker;
  }
  return intent;
}

export function applyResolvedEntities(intent, resolvedEntities, { requireSecurity = false, primaryFromMultiple = false } = {}) {
  if (!intent || typeof intent !== "object" || !Array.isArray(resolvedEntities) || !resolvedEntities.length) return intent;
  const asSecurity = entity => ({
    spoken_name: entity.spoken_name ?? entity.ticker,
    ticker: entity.ticker,
    venue: entity.venue,
    asset_class: entity.asset_class,
    needs_resolution: false
  });
  if (!intent.security && requireSecurity && (resolvedEntities.length === 1 || primaryFromMultiple)) intent.security = asSecurity(resolvedEntities[0]);
  if (intent.security) {
    const spoken = normalize(intent.security.spoken_name);
    const ticker = String(intent.security.ticker ?? "").toUpperCase();
    const matched = resolvedEntities.find(entity => normalize(entity.spoken_name) === spoken || String(entity.ticker ?? "").toUpperCase() === ticker);
    if (matched) Object.assign(intent.security, asSecurity(matched));
  }
  for (const action of intent.post_open_actions ?? []) {
    if (!actionFeatures.has(String(action.feature ?? "").toLowerCase())) continue;
    const matched = resolvedEntities.find(entity => normalize(entity.spoken_name) === normalize(action.value) || String(entity.ticker ?? "").toUpperCase() === String(action.value ?? "").toUpperCase());
    if (matched) action.value = matched.ticker;
  }
  return intent;
}

export function rejectUnverifiedModelTicker(intent, transcript) {
  const security = intent?.security;
  if (!security || typeof security !== "object" || !security.ticker) return intent;

  const spoken = normalize(security.spoken_name);
  const ticker = String(security.ticker).trim().toUpperCase();
  const knownAlias = bySpoken.get(spoken);
  if (knownAlias?.ticker === ticker) return intent;

  // Trust an explicit ticker the user actually said, but never trust the model
  // to map an unfamiliar company name from memory. Godel's own autocomplete is
  // the authority for that mapping (e.g. Lantheus is LNTH, not model-guessed LHX).
  const normalizedTranscript = ` ${normalize(transcript)} `;
  const compactTicker = ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  const explicitForms = [normalize(ticker), compactTicker];
  if (/^[a-z]{2,8}$/.test(compactTicker)) explicitForms.push([...compactTicker].join(" "));
  const explicitTicker = spoken.replace(/ /g, "").toUpperCase() === compactTicker.toUpperCase()
    || explicitForms.some(form => form && normalizedTranscript.includes(` ${form} `));
  if (!explicitTicker) {
    security.ticker = null;
    security.venue = null;
    security.asset_class = null;
    security.needs_resolution = true;
  }
  return intent;
}

export function resolveTranscriptSecurities(transcript) {
  const text = ` ${normalize(transcript)} `;
  const hasCue = securityCue.test(text);
  const matches = [];
  for (const security of securities) {
    const positions = transcriptAliases(security)
      .filter(candidate => !candidate.requiresCue || hasCue)
      .filter(candidate => !candidate.requiresExplicitTicker
        || text.includes(` ticker ${candidate.alias} `)
        || text.includes(` symbol ${candidate.alias} `))
      .map(candidate => ({ alias: candidate.alias, index: text.indexOf(` ${candidate.alias} `) }))
      .filter(match => match.index >= 0)
      .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
    if (positions.length) matches.push({ security, index: positions[0].index });
  }
  return matches
    .sort((a, b) => a.index - b.index)
    .map(({ security }) => ({
      spoken_name: security.aliases[0],
      ticker: security.ticker,
      venue: security.venue,
      asset_class: security.asset_class
    }));
}

export const commonSecurities = securities;

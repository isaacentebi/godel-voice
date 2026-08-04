(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GodelPanelInsights = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clean(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function number(value) {
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function multiple(value) {
    const parsed = number(value);
    if (parsed == null || parsed < -1000 || parsed > 10000) return null;
    return Number.isInteger(parsed) ? `${parsed}x` : `${parsed.toFixed(1).replace(/\.0$/, "")}x`;
  }

  function extractForwardPE(text) {
    const source = clean(text);
    const anchor = /(?:fwd|forward)\s+p\s*\/?\s*e\b/i.exec(source);
    if (!anchor) return [];
    const tail = source.slice(anchor.index + anchor[0].length, anchor.index + anchor[0].length + 260);
    const values = [];
    const re = /\b(FY\s*'?\d{2,4}|CY\s*'?\d{2,4}|\d{4})\b[^\d-]{0,24}(-?\d+(?:\.\d+)?)\s*[x×]\b/gi;
    for (const match of tail.matchAll(re)) {
      const value = multiple(match[2]);
      if (value) values.push({ period: match[1].replace(/\s+/g, "").toUpperCase(), value });
      if (values.length === 3) break;
    }
    if (values.length) return values;

    const unlabelled = /(-?\d+(?:\.\d+)?)\s*[x×]\b/i.exec(tail);
    const value = unlabelled && multiple(unlabelled[1]);
    return value ? [{ period: null, value }] : [];
  }

  function extractHaltCounts(text) {
    const source = clean(text);
    const total = /\bTotal\s*:\s*(\d+)\b/i.exec(source);
    const active = /\bActive\s*:\s*(\d+)\b/i.exec(source);
    if (!total && !active) return null;
    return { total: total ? number(total[1]) : null, active: active ? number(active[1]) : null };
  }

  function extractDescriptionPE(text) {
    const source = clean(text);
    const result = {};
    for (const [key, expression] of [
      ["forward", /(?:fwd|forward)\s+p\s*\/?\s*e\s*[:]?\s*(-?\d+(?:\.\d+)?)\s*[x×]?\b/i],
      ["trailing", /(?:trailing|ttm)\s+p\s*\/?\s*e\s*[:]?\s*(-?\d+(?:\.\d+)?)\s*[x×]?\b/i]
    ]) {
      const match = expression.exec(source);
      const value = match && multiple(match[1]);
      if (value) result[key] = value;
    }
    return Object.keys(result).length ? result : null;
  }

  function extractEMPE(text) {
    const source = clean(text);
    if (!/^EM Multiples P\/E\b/.test(source) || /%/.test(source)) return null;
    const last = /\bLast 4Q\s+([^ ]+(?:\s*[x×])?)/i.exec(source);
    const next = /\bNext 4Q\s+([^ ]+(?:\s*[x×])?)/i.exec(source);
    const parse = match => {
      const raw = clean(match?.[1]);
      if (!/^\d{1,4}(?:\.\d{1,4})?\s*[x×]$/i.test(raw)) return null;
      const numeric = Number(raw.replace(/[x×]/gi, "").trim());
      return numeric > 0 && numeric < 10000 ? `${numeric}x` : null;
    };
    const last4q = parse(last);
    const next4q = parse(next);
    if (!last4q || !next4q) return null;
    const fiscalYears = [];
    for (const match of source.matchAll(/\b(FY \d{4})\s+(\d{1,4}(?:\.\d{1,4})?\s*[x×])\b/gi)) {
      const value = parse([null, match[2]]);
      if (!value) return null;
      fiscalYears.push({ period: match[1].toUpperCase(), value });
    }
    if (!fiscalYears.length) return null;
    return { last4q, next4q, fiscalYears };
  }

  function extractEMValuation(text) {
    const source = clean(text);
    const heading = /^EM Multiples (.+?) (Multiple|Percent) :: (.+)$/i.exec(source);
    if (!heading) return null;
    const row = heading[1].trim();
    const semanticUnit = heading[2][0].toUpperCase() + heading[2].slice(1).toLowerCase();
    const allowedRows = new Set(["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"]);
    const expectedUnit = row === "Dividend Yield" ? "Percent" : "Multiple";
    if (!allowedRows.has(row) || semanticUnit !== expectedUnit) return null;
    const values = [];
    for (const segment of heading[3].split(" ;; ")) {
      const match = /^(Last 4Q|Next 4Q|FY \d{4}) = (.+)$/.exec(segment.trim());
      if (!match) return null;
      const valid = semanticUnit === "Multiple"
        ? /^-?\d{1,5}(?:\.\d{1,6})?\s*[x×]$/i.test(match[2])
        : /^-?\d{1,5}(?:\.\d{1,6})?\s*%$/.test(match[2]);
      if (!valid) return null;
      values.push({ period: match[1], value: match[2].replace(/×/g, "x") });
    }
    if (values.length < 3 || values[0].period !== "Last 4Q" || values[1].period !== "Next 4Q") return null;
    return { row, semanticUnit, values };
  }

  function extractChartQuote(text) {
    const source = clean(text);
    // Godel's chart header renders price, absolute change, percentage change,
    // then “Vol”. Requiring that complete sequence avoids reading an axis tick
    // or an unrelated historical value as the current quote.
    const match = /(?:^|\s)([$€£])?([0-9][0-9,]*(?:\.[0-9]+)?)\s*([+-])\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([+-])\s*([0-9]+(?:\.[0-9]+)?)%\s*Vol\b/i.exec(source);
    if (!match) return null;
    const price = number(match[2]);
    const change = number(match[4]);
    const percent = number(match[6]);
    if (price == null || change == null || percent == null || price < 0 || percent > 1000) return null;
    const prefix = match[1] ?? "";
    return {
      price: `${prefix}${price.toLocaleString("en-US", { maximumFractionDigits: 8 })}`,
      direction: match[5] === "-" ? "down" : "up",
      percent: `${percent.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`,
      change: `${match[3] === "-" ? "-" : "+"}${change.toLocaleString("en-US", { maximumFractionDigits: 8 })}`
    };
  }

  function extractTRANResearch(text) {
    const source = String(text ?? "");
    const prefix = "TRAN Research :: ";
    if (!source.startsWith(prefix) || source.length > 32_000) return null;
    let value;
    try { value = JSON.parse(source.slice(prefix.length)); } catch { return null; }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const company = clean(value.company).slice(0, 100);
    const question = clean(value.question).slice(0, 400);
    const periods = Array.isArray(value.periods) ? value.periods.slice(0, 8).map(item => {
      const period = clean(typeof item === "string" ? item : item?.period).slice(0, 40);
      const date = clean(typeof item === "object" ? item?.date : "").slice(0, 40);
      return period ? { period, ...(date ? { date } : {}) } : null;
    }).filter(Boolean) : [];
    const topics = Array.isArray(value.topics) ? value.topics.slice(0, 5).map(item => {
      if (!item || typeof item !== "object") return null;
      const topic = clean(item.topic).slice(0, 100);
      const mentions = Number(item.mentions);
      const topicPeriods = Array.isArray(item.periods)
        ? item.periods.slice(0, 8).map(entry => clean(entry).slice(0, 40)).filter(Boolean)
        : [];
      if (!topic || !Number.isInteger(mentions) || mentions < 0 || mentions > 100_000) return null;
      return { topic, mentions, periods: topicPeriods };
    }).filter(Boolean) : [];
    if (!company || !periods.length || !topics.length) return null;
    const summary = clean(value.summary).slice(0, 360);
    const currentPeriod = clean(value.answer_period ?? value.current?.period).slice(0, 40);
    const hasCurrent = Boolean(clean(value.current?.period) && clean(value.current?.text));
    return { company, question, periods, topics, summary, hasCurrent, currentPeriod };
  }

  function completionFact(command, text, company = "The company") {
    const label = clean(company) || "The company";
    const code = String(command ?? "").toUpperCase();
    if (code === "ERN") {
      const values = extractForwardPE(text);
      if (!values.length) return null;
      const first = values[0];
      return first.period
        ? `${label}'s ${first.period} forward P/E is ${first.value}.`
        : `${label}'s forward P/E is ${first.value}.`;
    }
    if (code === "DES") {
      const values = extractDescriptionPE(text);
      if (!values) return null;
      if (values.forward) return `${label}'s forward P/E is ${values.forward}.`;
      if (values.trailing) return `${label}'s trailing P/E is ${values.trailing}.`;
    }
    if (code === "EM") {
      const valuation = extractEMValuation(text);
      if (valuation) {
        const next = valuation.values.find(item => item.period === "Next 4Q");
        return next ? `${label}'s Next 4Q ${valuation.row} is ${next.value}.` : null;
      }
      const values = extractEMPE(text);
      return values ? `${label}'s next-four-quarter P/E is ${values.next4q}.` : null;
    }
    if (code === "HALT") {
      const counts = extractHaltCounts(text);
      if (!counts) return null;
      if (counts.active != null && counts.total != null) return `Godel shows ${counts.active} active halts out of ${counts.total} total.`;
      if (counts.active != null) return `Godel shows ${counts.active} active halts.`;
      return `Godel shows ${counts.total} total halts.`;
    }
    if (code === "G") {
      // A daily chart header can be the latest regular-session value after
      // hours. Do not present it as a live quote until Godel's quote surface
      // has an independently verified freshness timestamp.
      return null;
    }
    if (code === "TRAN") {
      const research = extractTRANResearch(text);
      if (!research) return null;
      if (research.summary) {
        const oriented = research.currentPeriod && !research.summary.includes(research.currentPeriod)
          ? `In ${research.currentPeriod}, ${research.summary.charAt(0).toLowerCase()}${research.summary.slice(1)}`
          : research.summary;
        if (!research.hasCurrent || /\b(?:highlighted|on screen)\b/i.test(oriented)) return oriented;
        return `${oriented} I've highlighted the strongest passage on screen.`;
      }
      const found = research.topics.filter(item => item.mentions > 0);
      if (!found.length) {
        const names = research.topics.map(item => item.topic).join(" or ");
        return `I didn't find ${names} in the ${research.periods.length} loaded ${label} calls.`;
      }
      const first = found[0];
      const span = first.periods.length
        ? ` across ${first.periods.slice(0, 3).join(", ")}`
        : "";
      return `I found ${first.topic} ${first.mentions} ${first.mentions === 1 ? "time" : "times"}${span}.${research.hasCurrent ? " I've highlighted the strongest passage on screen." : ""}`;
    }
    return null;
  }

  return { clean, extractForwardPE, extractHaltCounts, extractDescriptionPE, extractEMPE, extractEMValuation, extractChartQuote, extractTRANResearch, completionFact };
});

import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/panel-insights.js");
const insights = globalThis.GodelPanelInsights;

test("chart completion narrates only the exact Godel quote-header shape", () => {
  assert.deepEqual(insights.extractChartQuote("CHART META US $593.20 + 36.49 + 6.55% Vol 31.7M"), {
    price: "$593.2", direction: "up", percent: "6.55%", change: "+36.49"
  });
  assert.equal(insights.completionFact("G", "CHART META US $593.20 + 36.49 + 6.55% Vol 31.7M", "Meta"), null);
  assert.equal(insights.extractChartQuote("CHART axis 593.20 500.00 400.00"), null);
});

test("Q completion requires Godel's full timestamped quote-header shape", () => {
  const text = "AMZN US $277.94 -6.08 -2.14% Vol 69.7M B 277.80 x 359 / 278.00 x 1,310 A At: 17:59:53";
  assert.deepEqual(insights.extractQuickQuote(text, "AMZN"), {
    security: "AMZN", venue: "US", price: "$277.94", direction: "down", percent: "2.14%",
    change: "-6.08", volume: "69.7M", bid: "277.80", bidSize: "359", ask: "278.00", askSize: "1,310", at: "17:59:53"
  });
  assert.equal(insights.extractQuickQuote(text, "META"), null);
  assert.equal(insights.extractQuickQuote(text.replace("AMZN US", "AMZNUS"), "AMZN").venue, "US");
  assert.equal(insights.completionFact("Q", text, "Amazon"), "Godel shows Amazon at $277.94, down 2.14%, as of 17:59:53.");
  assert.equal(insights.extractQuickQuote("AMZN US $277.94 -6.08 -2.14% Vol 69.7M"), null);
});

test("EM completion reads exact Multiples rows with semantic units", () => {
  const text = "EM Multiples P/E Multiple :: Last 4Q = 22.6x ;; Next 4Q = 30.0x ;; FY 2026 = 23.2x";
  const multiple = insights.extractEMValuation(text);
  assert.equal(multiple.row, "P/E");
  assert.equal(multiple.values[1].value, "30.0x");
  assert.equal(insights.completionFact("EM", text, "Amazon"), "Amazon's Next 4Q P/E is 30.0x.");
  assert.equal(insights.extractEMValuation("EM Multiples P/E Multiple :: Last 4Q = 22.6% ;; Next 4Q = 30.0% ;; FY 2026 = 23.2%"), null);
  assert.equal(insights.extractEMValuation("EM Multiples NOPAT Multiple :: Last 4Q = 22.6x ;; Next 4Q = 30.0x ;; FY 2026 = 23.2x"), null);
  assert.equal(insights.extractEMValuation("EM Multiples Dividend Yield Multiple :: Last 4Q = 2.6x ;; Next 4Q = 3.0x ;; FY 2026 = 3.2x"), null);
  assert.equal(insights.extractEMValuation("EM Multiples Dividend Yield Percent :: Last 4Q = 2.6% ;; Next 4Q = 3.0% ;; FY 2026 = 3.2%").semanticUnit, "Percent");
});

test("TRAN completion narrates only bounded structured research evidence", () => {
  const result = {
    company: "Amazon",
    question: "Did management discuss AWS capacity?",
    periods: [{ period: "Q2 2026" }, { period: "Q1 2026" }, { period: "Q4 2025" }],
    topics: [{ topic: "AWS capacity", mentions: 4, periods: ["Q2 2026", "Q1 2026"] }]
  };
  const marker = `TRAN Research :: ${JSON.stringify(result)}`;
  assert.equal(insights.extractTRANResearch(marker).topics[0].mentions, 4);
  assert.equal(
    insights.completionFact("TRAN", marker, "Amazon"),
    "I found AWS capacity 4 times across Q2 2026, Q1 2026."
  );
  assert.equal(insights.extractTRANResearch("Amazon mentioned AWS capacity four times"), null);
  assert.equal(insights.extractTRANResearch("TRAN Research :: not-json"), null);
  assert.equal(insights.completionFact("TRAN", "TRAN Research :: {}", "Amazon"), null);
});

test("TRAN completion reports an exact absence without inventing a trend", () => {
  const result = {
    company: "Amazon",
    periods: [{ period: "Q2 2026" }, { period: "Q1 2026" }],
    topics: [{ topic: "quantum dividends", mentions: 0, periods: [] }]
  };
  assert.equal(
    insights.completionFact("TRAN", `TRAN Research :: ${JSON.stringify(result)}`, "Amazon"),
    "I didn't find quantum dividends in the 2 loaded Amazon calls."
  );
});

test("TRAN substantive summaries orient the user to highlighted evidence", () => {
  const result = {
    company: "Amazon",
    question: "What did management say about GPU availability?",
    periods: [{ period: "Q2 2026" }],
    topics: [{ topic: "gpu availability", mentions: 1, periods: ["Q2 2026"] }],
    summary: "Management said compute capacity remained constrained while new supply was coming online.",
    current: { period: "Q2 2026", text: "Compute capacity remained constrained." }
  };
  assert.equal(
    insights.completionFact("TRAN", `TRAN Research :: ${JSON.stringify(result)}`, "Amazon"),
    "In Q2 2026, management said compute capacity remained constrained while new supply was coming online. I've highlighted the strongest passage on screen."
  );
});

test("TRAN completion always names the exact answer quarter", () => {
  const result = {
    company: "Amazon",
    question: "What changed?",
    periods: [{ period: "Q2 2026" }],
    topics: [{ topic: "backlog", mentions: 1, periods: ["Q2 2026"] }],
    summary: "The call states that backlog reached $496 billion.",
    answer_period: "Q2 2026"
  };
  assert.equal(
    insights.completionFact("TRAN", `TRAN Research :: ${JSON.stringify(result)}`, "Amazon"),
    "In Q2 2026, the call states that backlog reached $496 billion."
  );
});

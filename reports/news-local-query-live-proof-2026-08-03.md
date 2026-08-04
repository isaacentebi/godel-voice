# News exact-query live proof — 2026-08-03

The authenticated Godel News panel exposes one safe, per-window search path. The exact control is the unique visible input whose placeholder is `Search exact term`. Enter applies the query. Godel then renders a local delete affordance and refreshes the unique News table with exact headers `Headline`, `Date`, `Time`, `Ticker`, and `Source`.

Production binding:

- workflow action: `N query.set` with a trimmed 1–200 character string;
- page adapter: `extension/main-world.js#runNews`;
- content dispatch: `extension/content.js#executeNews`;
- deterministic language: `src/news-followup.mjs`;
- fail-closed addressing: one exact News panel, one exact query input, one exact result table, and one local active-query affordance;
- safety: read-only and per-window. Account-global source, category, language, keyword, class-action and breaking-alert filters are never touched.

Authenticated natural-delivery results:

| Phrase | Rendered result | Workflow |
|---|---|---:|
| “search the news for apple trade secrets” | exact query plus two matching News rows, headed by an Apple/OpenAI trade-secrets Reuters item | 208 ms |
| “search news for fed cuts wait no search news for open eye anti trust” | corrected exact query `OpenAI antitrust`; valid rendered `No results` table state | 207 ms |

The second case deliberately proves correction handling and that zero results are completion, not an automation failure. Generic “open news” and global-filter language do not enter this path.

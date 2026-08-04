# Full News voice architecture

News has three different state domains. Jarvis keeps them separate:

| Domain | Controls | Safety state |
|---|---|---|
| Per-window | exact query, security/global/watchlist scope, All/Before date, Pause/Live, clear local filters | query live; remaining controls unbound |
| Account filter draft | source/category include or exclude, languages, include/exclude keywords, class-action Show/Hide/Only | unbound dynamic controls |
| Account persistence | save current draft, reset to recommended, clear saved filters, cancel draft | confirmation-gated mutations |
| Article reader | select/open article, Back, inline context, TTS | unbound; exact article identity required |
| Artifact | selected-article PDF | unbound; verified browser download receipt required |

The official command contract documents only `All` and `Before` date semantics. “After,” “since,” “last week,” and arbitrary ranges are rejected instead of being translated into a different filter.

Dynamic source, category, language, and watchlist names must resolve uniquely against the addressed live control. Article commands must carry the exact selected article ID and headline. Positional selection such as “the second article” is accepted only when an authoritative live article list supplies that identity.

Source, category, language, keyword, and class-action filters are account-global drafts; phrases that ask to apply them “only to this window” fail closed. Saving, resetting, or clearing account filters always requires confirmation. Local clear and global clear are intentionally different actions, and an ambiguous “clear the news filters” asks for clarification.

Keyword lists contain 1–20 explicit entries. Class-action mode is exactly Show, Hide, or Only. Contradictory scope, date, pause, class-action, inline-context, or TTS requests produce no actions.

The fast path is atomic. The exact per-window query remains live, but “search for rate cuts and pause” does not run only the search while ignoring the unverified pause. Every requested action must be live or the whole deterministic fast path declines.

PDF export applies only to the exact selected/open article, never the news feed. Completion requires the shared download receipt gate: pre-registration bound to workflow/panel/article, overwrite uniquification, `.pdf`, `application/pdf`, file existence, and nonzero size.

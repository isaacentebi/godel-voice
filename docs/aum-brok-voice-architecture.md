# AUM and BROK privacy architecture

`AUM` and `BROK` expose private financial state. Their voice contracts therefore disclose less by default than ordinary research panels and remain runtime-disabled until live controls and postconditions are proven.

## AUM

Voice may select the documented `Global` or `Personal` tab and request a read-only refresh. Existing state is preserved when the tab is omitted. Conflicting tabs produce no executable plan.

Opening, showing, or refreshing AUM never causes Jarvis to speak an amount. A total is eligible for narration only when the user explicitly asks “how much,” “what is the total,” “read,” “say,” “announce,” or “tell me.” The fact must be an exact current Godel AUM panel observation with a matching tab, finite non-negative amount, ISO currency, timestamp, and authenticated source. A refresh-plus-read request cannot reuse the pre-refresh amount.

“Don’t say the amount,” “silently,” and “privacy mode” suppress narration. Asking for and suppressing the amount in the same corrected clause clarifies rather than choosing one.

## BROK

Voice may open the brokerage connection manager in read-only mode and explicitly read grounded connection status. Status narration is limited to exact observed connection rows; it excludes balances, buying power, credentials, and tokens.

Connect, reconnect, disconnect, and brokerage-request intents create only a sanitized confirmation proposal tied to one exact selected connection. They never enter the unattended action list and remain runtime-disabled even after confirmation until a separate live adapter exists.

Credential, password, passcode, API-key, secret, token, Query-ID, and login speech is blocked immediately and never echoed into the result. Orders, trades, exercises, transfers, deposits, withdrawals, or balance mutations are unsupported because Godel documents BROK as a read-only connection manager. Balance reads are routed conceptually to an explicitly requested grounded Personal AUM read, not improvised from BROK.

## Speech and atomicity

Common noisy forms such as “A U M,” “brockerage,” and “broker age” are normalized. A correction after “wait no,” “no sorry,” “actually,” “scratch that,” “I mean,” “rather,” or “correction” replaces the superseded clause. Contradictions, missing live identities, stale tab facts, and malformed private facts yield zero executable actions. No raw utterance or secret-bearing value is logged by these compilers.

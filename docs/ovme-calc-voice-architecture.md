# OVME and CALC voice architecture

Both calculator surfaces compile locally into strict, inspectable data and remain runtime-disabled until Godel's exact live controls and completion signals are proven.

## OVME

OVME compiles one complete Black–Scholes model, never a partially executable list of fields. Option-price solving requires Call/Put, spot, strike, time to expiry, risk-free rate, dividend yield, and volatility. Implied-volatility solving replaces volatility with an observed option price. Missing fields return clarification.

Time always carries an explicit unit: days, months, or years. Non-zero rates, yields, and volatility must be spoken as percent or decimal. “Five percent” becomes `{decimal: 0.05, display_percent: 5}`; “0.05 decimal” becomes the same value. Zero may omit a unit because percent and decimal zero are identical.

Short followups merge only explicitly changed fields into authoritative `current_state`. Conflicting Call/Put, solve targets, times, or duplicate field values clarify. Spot, strike, time, option price, and any observed calculation output must be finite and valid. OVME has no trade action and blocks buy, sell, submit, cancel, and exercise language.

## CALC

CALC uses a purpose-built tokenizer, parser, and evaluator. It never calls JavaScript `eval`, creates a function, accesses properties, or accepts arbitrary identifiers.

Allowed arithmetic is `+ - * / % ^` with parentheses. Scientific functions are `sqrt`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `log`, `ln`, `exp`, `pow`, `min`, and `max`; constants are `pi` and `e`. Financial functions are `pv`, `rate`, `pmt`, `fv`, `nper`, `apr`, and `ear`. Every result must be finite.

Natural operators such as “plus”, “minus”, “times”, “divided by”, “to the power of”, “squared”, and common spoken functions normalize into the strict grammar. Corrections replace the superseded clause. With authoritative context, “divide that by two” applies to the preserved prior expression. Multiple separate calculations in one sentence clarify instead of partially running.

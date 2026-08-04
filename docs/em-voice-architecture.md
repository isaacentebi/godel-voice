# EM earnings-matrix voice architecture

The exact native metric selector remains the only live nested EM action. Everything else is represented strictly but remains disabled until an independent control and rendered postcondition are proven.

## Matrix controls

- Metrics: Sales, EBITDA, Net Income, EPS (GAAP), Total Assets, Current Assets, Current Liabilities, Shareholder Equity, Cash Flow From Operations, Cash Flow From Investing, and Cash Flow From Financing.
- Growth basis: YoY % Growth or PoP % Growth.
- Chart: Values Chart or Growth Chart.
- Series visibility: show or hide Historical and Estimates independently. “Historical only” means show Historical and hide Estimates; “estimates only” does the inverse.

## Valuation semantics

P/E, P/B, P/S, P/CF, EV/EBITDA, EV/Sales, EV/CF, and EV/FCF are read from EM’s **Multiples** section and carry `Multiple` semantics (for example `15x`), never percentage semantics. Dividend Yield appears in the same section but carries `Percent` semantics. A valuation row is not sent to the metric selector and is not invented as a graph series.

Noisy speech such as “pee e”, “e bit duh”, “cash eff oh”, and corrections is normalized before validation. Explicit contradictions block the entire compound request. A request containing one live metric action and any unbound action does not degrade to metric-only execution.

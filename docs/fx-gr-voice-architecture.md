# FX and GR voice architecture

## FX

FX accepts currencies only from the current panel's exact `live_currencies` identities and aliases. It compiles one atomic conversion with distinct `from` and `to` ISO-style currency codes, a finite nonnegative amount, and an optional invert flag. A one-currency request must say whether it changes the source or destination. Omitted values may come only from authoritative `current_state`.

The compiler does not calculate or narrate an exchange result itself. `groundedFXResult` returns a result only when Godel supplied a finite amount, three-letter output currency, panel identity `FX`, and observation timestamp. Direct, inverse, and USD-cross routing remain Godel's responsibility.

All FX controls remain runtime-disabled pending a proven native binding and rendered conversion postcondition.

## GR

GR resolves every leg through `resolved_securities`; company names and unfamiliar ticker-like speech are never guessed. In “Apple divided by Microsoft,” Apple is the Buy/numerator leg and Microsoft is the Sell/denominator leg. The stored semantic contract is always `buy price divided by sell price`. Buy and Sell are mathematical labels, not trade instructions.

Static periods are 1D, 1W, 1M, 3M, 6M, and 1Y. Longer periods must match one exact value or alias supplied in `live_longer_periods`. Correlation requires an explicit 2–730 day rolling window, unless an authoritative existing window is preserved. Regression and Full/Filtered data are explicit toggles.

The strict compiler does not newly promote GR controls. The existing legacy GR runtime is left untouched; it continues to accept its established action shapes while this compiler reports them as existing-runtime-unverified. Mixed invalid requests produce no strict executable subset.

`groundedGRResult` narrates only finite ratio/statistical values observed from a timestamped GR panel. It never manufactures ratio, beta, alpha, correlation, regression, or significance values.

Both parsers support full-clause spoken corrections, explicit contradiction checks, authoritative context preservation, and atomic failure.

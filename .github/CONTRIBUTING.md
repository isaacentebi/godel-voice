# Contributing

Contributions are welcome, especially reproducible fixes, new speech regressions, and carefully verified Godel panel adapters.

## Development setup

```sh
npm install
npm run build
npm test
```

Building and testing require no API key. Live model evaluations and live Godel verification are optional and must use private local credentials.

## Adding a capability

1. Add or correct the command/feature contract in `data/`.
2. Add natural, noisy, ambiguous, and contradictory speech cases.
3. Keep model output semantic; never invent terminal syntax for a UI-only control.
4. Add a panel-scoped adapter only after the control has a unique target and an observable postcondition.
5. Add browser-independent validation so malformed plans cannot reach the adapter.
6. Update `docs/user-guide.md` without overstating runtime support.
7. Run the complete test suite.

See `docs/architecture.md` and `docs/panel-adapters.md` for the execution model and adapter requirements.

## Pull requests

Keep changes focused and describe:

- the spoken request;
- the intended Godel result;
- the exact completion proof;
- failure and ambiguity behavior;
- tests added;
- whether live Godel verification was performed.

Do not commit credentials, private transcripts, Godel account data, local logs, generated secrets, or `extension/config.local.js`.

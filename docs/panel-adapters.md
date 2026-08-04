# Adding Godel controls

Godel Voice opens every catalogued command through Godel's CLI. Controls inside a panel require a dedicated adapter before they can be used by voice.

## Adapter requirements

Every adapter must:

- address one exact Godel panel;
- validate its input before touching the page;
- use a named operation, never model-generated JavaScript;
- prefer Godel-owned state transitions;
- verify the resulting state;
- fail when the target or completion state is ambiguous;
- include offline tests and one live Godel verification.

## Implementation path

1. Add the feature to `catalog/commands.json` and its capability contract.
2. Parse representative natural, noisy, corrected, and ambiguous phrases.
3. Add the operation to the workflow and browser allowlists.
4. Implement the panel-scoped action in `extension/content.js` or `extension/main-world.js`.
5. Add a content-based completion assertion.
6. Update `docs/user-guide.md` only after live verification.

Layout operations—focus, move, resize, maximize, restore, and safe close—use Godel's native workspace state. Sensitive panels and consequential mutations remain blocked.

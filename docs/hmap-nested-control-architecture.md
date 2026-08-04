# HMAP nested-control architecture

The heatmap planner models the full documented toolbar while preserving one hard boundary: **only Map/Table is currently live-executable**. Every other action below is parsed and validated as a disabled candidate until its exact Godel callback and independent rendered postcondition are proven.

| Control | Candidate value | Required completion proof | Runtime |
|---|---|---|---|
| Universe | `S&P 500` or `DJIA` | exact control label, member identity/count change | disabled |
| Watchlist | exact live watchlist name | exact selected name and members belong to that watchlist | disabled |
| Size By | exact option read from the live menu | selected label plus changed tile geometry/weights | disabled |
| Label | exact option read from the live menu | selected label plus rendered tile labels | disabled |
| Sectors | `Show` or `Hide` | sector headers/groups independently present or absent | disabled |
| Animate | `On` or `Off` | semantic toggle state plus animation scheduler state | disabled |
| Update interval | positive integer milliseconds; live bounds still required | slider value and displayed `N ms` label agree | disabled |
| Color | exact `Auto` or `Manual` | semantic mode state and palette behavior agree | disabled |
| Manual parameters | unresolved | no schema until exact parameter controls are observed | blocked |
| Movers | `Open` or `Closed` | disclosure state and drawer visibility agree | disabled |
| Tile quick action | exact live ticker plus exact live action | selected tile ticker and destination panel identity agree | disabled |
| View | `Map` or `Table` | existing live map/table rendered postcondition | **live** |

`src/hmap-followup.mjs` handles noisy watch-list spacing, S&P/Dow aliases, milliseconds versus seconds, toolbar ordering, and explicit contradictions. Conflicting universes, toggles, color modes, Movers states, or views produce a clarification candidate with no actions.

The fast path is atomic. For example, “hide sectors and switch to table view” does not execute Table while dropping the unverified sector request; the whole fast path declines. A Table-only or Map-only request continues through the existing verified binding unchanged.

Dynamic metric, watchlist, and tile-action names are never treated as an invented enum. A later live adapter must read them from the addressed HMAP control. Tile handoff additionally requires a unique live tile and a unique exact quick action. Manual palette thresholds, gradients, bounds, and colors remain blocked even when Manual mode itself is requested.

# Window and layout control audit

Jarvis can reliably arrange and control Godel's own panels without browser-level computer use. The implementation invokes Godel-owned window state and React callbacks; it never simulates a drag or writes raw CSS.

| Voice capability | Feasibility | Grounded behavior | Main limitation |
|---|---|---|---|
| Move left/right/top/bottom/corners/full | Live verified | Computes an in-bounds rectangle and applies it through Godel's native position manager | Active Godel screen only |
| Make larger/smaller | Source verified | Scales by 20%, centers, clamps to workspace and verifies rendered size | No absolute spoken dimensions yet |
| Maximize/restore | Source verified | Uses Godel's fullscreen toggle and verifies native previous-geometry state | Godel panel fullscreen, not Arc fullscreen |
| Focus exact panel | Partial | Sets the active window id and verifies native active state | Live EM passed; one IMAP panel lacked a resolvable native active id and failed closed |
| Close exact panel | Source verified | Invokes exactly one native close callback and proves the panel disappeared | Named security is safest when duplicate command panels exist |
| Arrange a multi-panel workflow | Live verified | Uses research, market, comparison, options, grid or focus presets | Overflow is reported instead of moving unrelated panels |
| Create/reuse/focus/rename screen | Live verified | Uses Godel workspace and tab callbacks | Eight-screen maximum; empty Voice/Blank screens are reused |
| Move an existing panel between screens | Unsupported | Recreate it on an exact destination screen | No verified native transfer callback |
| Close an entire Godel screen | Unsupported | No unattended fallback | Must not be confused with panel or browser close |

## Exact targeting model

Controls can address the last panel Jarvis created, Godel's focused panel, a command family, or a command plus security. Before resolving a target, the executor asks Godel for the active screen's native window ids. Hidden mounted panels from other screens are therefore excluded. Within one command family, it prefers the remembered instance, then the active instance, then the highest exposed instance. A security name such as `META` must also appear in the panel before it qualifies.

This makes “close the Meta earnings matrix” materially safer than “close the earnings matrix” when several matrices are open. Bulk destructive phrases now fail closed: “close all windows,” “remove every panel,” and “dismiss the whole screen” do not compile into a single-panel close.

## Geometry and state assertions

- Move and resize accept only finite coordinates, minimum 280 × 190, maximum 10,000 × 10,000. Completion requires rendered width and height within four pixels of the requested native geometry.
- Maximize succeeds only when Godel records previous geometry; restore succeeds only when that marker clears.
- Focus succeeds only when the target exposes the active flag or the active screen's `activeWindowId` equals the exact target id.
- Close succeeds only when one native close control exists and the exact window root disconnects.
- Chat, notes, account, brokerage, order, trade, message and alert families cannot be closed unattended.

## Recommended Jarvis behavior

1. Prefer exact command-plus-security targets for close and focus: “close the Meta earnings matrix.”
2. Keep “it,” “that,” and “current panel” for immediate follow-ups after Jarvis has just opened or addressed a panel.
3. For complex workflows, create or reuse a named screen first, then open and arrange panels there.
4. If a layout overflows, ask to use a fresh screen; do not silently disturb unrelated research.
5. If asked to move a panel to another screen, explain that Jarvis will recreate it on that screen and leave the original untouched unless the user explicitly asks to close it afterward.
6. Never reinterpret a screen-close request as a panel close, and never invoke Arc's browser close.

## Candidate improvements

- Add an exact native cross-screen transfer only after capturing Godel's own callback and verifying source/destination window membership.
- Add absolute layouts (“make it 70% width”) only through normalized geometry with the same bounds and completion assertions.
- Expand company/ticker resolution so noisy phrases such as “the en vidia chart” still produce a command-plus-security target.
- Require an explicit clarification when multiple same-command panels exist and neither a security, remembered id nor native focus uniquely identifies one.

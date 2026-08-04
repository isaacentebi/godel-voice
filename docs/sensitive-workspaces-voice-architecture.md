# NOTE, ENT, ACM, and CHAT safety architecture

These account-scoped surfaces use a read-only action layer and a separate confirmation-required proposal layer. No persistent, financial, privacy, membership, or communication mutation is placed in an executable workflow. All live bindings remain disabled pending proof.

## NOTE

Opening or reading requires one exact note ID/title from the live list. Reading additionally requires one matching `Godel NOTE panel` fact with the exact content and update timestamp. Create, edit, append, rename, save, and delete become sanitized proposals requiring confirmation. Proposed content is not retained in the result, so Jarvis cannot silently invent or save text.

## ENT

Voice may read exact grounded entitlement status and pending state, or select one exact live entitlement for inspection. Subscribe, unsubscribe, purchase, feed addition/removal, and acceptance of terms are never unattended. They produce confirmation-required proposals only after exact identity resolution.

## ACM

The only read action is opening account management in read-only mode. Profile, privacy/visibility, billing, payment method, cancellation, and FINRA/subscription upgrade requests are manual confirmation-required proposals. Passwords, card details, and account secrets are rejected and never echoed.

## CHAT

Read/open/search binds one exact public channel, symbol room, DM, or group identity. Message narration requires exact current `Godel CHAT panel` rows for that same channel. Sending, replying, editing, deleting, reacting, DM/group creation or changes, leaving/hiding channels, and hiding users are confirmation-required and unsupported unattended. Proposal results retain no message text and send nothing.

CHAT export remains disabled because both format and scope are unresolved. Corrections discard prior clauses; conflicting mutations and mixed unsupported clauses fail atomically. Source contains no logging sink, and secret-like requests return only generic blockers.

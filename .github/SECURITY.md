# Security policy

## Reporting a vulnerability

Please report security issues privately to the repository owner instead of opening a public issue. Include the affected version, a minimal reproduction, expected impact, and any suggested mitigation. Do not include real API keys, Godel data, voice transcripts, account details, or localhost bearer secrets.

## Credential handling

- Keep provider credentials only in the ignored `.env` file.
- Never put credentials in `extension/`, screenshots, test fixtures, reports, issues, or commits.
- `npm run setup` creates the localhost handoff secret and extension configuration locally; both are ignored and restricted to the current user.
- Run `npm run doctor` after installation or an update to verify file permissions, service identity, and secret agreement.
- Rotate a key immediately if it may have been exposed. Re-run `npm run setup` if the local bearer secret is exposed.

## Trust boundary

The model proposes a structured workflow. Local code independently validates it before the Arc extension can operate Godel. The loopback server accepts authenticated requests only, the extension is host-scoped, and unsupported or ambiguous actions fail closed.

This project does not intentionally automate order entry, money movement, account changes, subscription changes, or unattended communication.

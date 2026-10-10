# Inji Interoperability Playground

A visual lab for the whole Verifiable Credential lifecycle across the Inji stack: **design** your own issuer and credential types, **issue** them through Inji Certify, **hold** them in a wallet, **present** them to Inji Verify, and **watch every protocol message** on the way.

> Work in progress for MOSIP Decode 2026 (PS2). Full documentation lands with the first release.

## Quick start (development)

```bash
docker compose -f infra/compose.yml -f infra/compose.dev.yml up -d   # Postgres, Inji Certify 0.14.0, Inji Verify 0.18.2
pnpm install
pnpm --filter @playground/bff dev                                     # gateway + API on http://playground.localhost:8080
```

## What works so far
- **One Compose bundle** running released Inji images, unmodified (configuration only).
- **Issuer Studio API**: create issuer profiles and credential types; each type is pushed to Certify's `/credential-configurations` and confirmed in its issuer metadata.
- **Recording gateway**: wallets reach Certify and Verify only through `/pub/*`; every exchange is classified, attributed to a run and sealed with AES-256-GCM. Certify's admin APIs are never exposed.
- **Reference Wallet (issuance)**: an independent OpenID4VCI pre-authorized-code client; its credentials verify at Inji Verify.

## Licence
[MPL-2.0](LICENSE), the same as Inji.

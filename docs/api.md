# API

The playground serves three kinds of HTTP routes on one origin (`http://localhost:8080` by default):

- **`/api/*`**: the BFF API the UI uses. JSON in and out. It is not authenticated and is meant for this machine
  only; in tunnel mode it is not reachable through the public URL unless `PUBLIC_UI=true` (see
  [security-privacy.md](security-privacy.md)).
- **`/pub/*`**: the wallet-facing surface. It covers the recording gateway to Inji Certify and Inji Verify, the
  Reference Verifier, and public documents (DID documents, keys, contexts, type metadata). It has no
  authentication, because wallets and verifiers must be able to fetch these anonymously.
- **`/ws`**: the WebSocket live feed (described in [architecture.md](architecture.md#live-feed)).

Sources: [apps/bff/src/api](../apps/bff/src/api), [gateway/proxy.ts](../apps/bff/src/gateway/proxy.ts),
[public/routes.ts](../apps/bff/src/public/routes.ts) and
[reference/verifier/service.ts](../apps/bff/src/reference/verifier/service.ts). Request bodies are validated
with zod schemas from [packages/core](../packages/core/src).

## Errors

Every `/api` error has the same shape:

```json
{ "error": "validation_failed", "message": "Some fields are invalid.", "issues": [{ "path": "fields.0.name", "message": "…" }] }
```

| Status | `error` | When |
|---|---|---|
| 400 | `validation_failed` | The body failed schema validation; `issues` lists each field |
| 400 | `invalid_json` | The body is not JSON |
| 400 | `invalid_request`, `invalid_offer` | A required field is missing |
| 404 | `not_found`, `run_not_found`, `event_not_found` | Unknown id (events may have been purged) |
| 409 | `type_exists`, … | A Studio conflict, e.g. a type name already used by that issuer |
| 502 | upstream code or `upstream_error` | Certify or Verify answered with an error; `detail` carries their body |
| 500 | `internal_error` | A bug; the log has the details |

An unknown `/api` path answers `404 {"error":"not_found"}`.

## Issuer Studio

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/issuers` | — | Issuer profiles, each with its `types` |
| POST | `/api/issuers` | `IssuerProfileInput` | 201, the profile |
| GET | `/api/issuers/:slug` | — | The profile with its `types` |
| PUT | `/api/issuers/:slug` | `IssuerProfileInput` | The profile; its types are re-synced to Certify |
| DELETE | `/api/issuers/:slug` | — | 204 |
| GET | `/api/types` | — | Every credential type |
| POST | `/api/types/preview` | `CredentialTypeInput` | What Certify would receive (configuration, Velocity template, JSON-LD context), without saving |
| POST | `/api/types` | `CredentialTypeInput` | 201, the type, after Certify has accepted it and advertises it in its issuer metadata |
| GET | `/api/types/:id` | — | The type plus `advertised` (whether Certify's metadata lists it right now) |
| PUT | `/api/types/:id` | `CredentialTypeInput` | The type, updated in Certify |
| DELETE | `/api/types/:id` | — | 204 |
| POST | `/api/types/:id/offers` | `{ claims, txCode?, expiresIn? }` | 201, `{ offerUri }`: a standalone `openid-credential-offer://` URI for any wallet |
| GET | `/api/studio/options` | — | `{ ldpSuites: [{suite, alg}], sdJwtAlgs }` |
| POST | `/api/studio/reconcile` | — | `{ created, updated, … }`: makes Certify's configurations match the store (also runs at start-up) |

**`IssuerProfileInput`**

| Field | Type | Notes |
|---|---|---|
| `slug` | string | 3–32 lowercase letters, digits, dashes; part of every public URL |
| `name` | string | 2–80 characters |
| `description` | string | ≤ 280 |
| `logoUrl` | URL or `""` | Empty: `/pub/issuers/<slug>/logo.svg` is generated from the initials |
| `backgroundColor`, `textColor` | `#RRGGBB` | Card colours in wallets |

**`CredentialTypeInput`**

| Field | Type | Default | Notes |
|---|---|---|---|
| `issuerSlug` | string | — | An existing issuer |
| `typeName` | PascalCase | — | The VC `type` (JSON-LD) or the last part of the `vct` (SD-JWT) |
| `displayName`, `description` | string | — | Shown in wallets |
| `format` | `ldp_vc` \| `vc+sd-jwt` | — | |
| `dataModel` | `1.1` \| `2.0` | `2.0` | JSON-LD only |
| `ldpSuite` | see `/api/studio/options` | `Ed25519Signature2020` | JSON-LD only |
| `sdJwtAlg` | `ES256` \| `EdDSA` \| `RS256` \| `ES256K` | `ES256` | SD-JWT only |
| `fields` | `FieldDef[]` | — | 1–30, unique names |
| `revocable` | boolean | `false` | Adds a status-list entry (Certify does this for VCDM 2.0 only) |
| `issuerForm` | `string` \| `object` | `string` | `object` reproduces gap G1 |
| `expiresAt` | ISO date or `""` | `""` | A past date makes a "valid but expired" credential |

**`FieldDef`**: `{ name, label, kind: text|number|date|boolean|choice, options?, required = true,
selectivelyDisclosable = true, example? }`. Names reserved by the VC data model (`id`, `type`, `issuer`, `vct`,
`iat`, `exp`, `_sd`, …) are refused.

```bash
curl -s -X POST localhost:8080/api/types -H 'content-type: application/json' -d '{
  "issuerSlug": "agri-dept", "typeName": "SoilHealthCard", "displayName": "Soil Health Card",
  "format": "vc+sd-jwt",
  "fields": [{ "name": "fullName", "label": "Full name" }, { "name": "soilPh", "label": "Soil pH", "kind": "number" }]
}'
```

## Runs

A run is one journey: issue → request → present → verify, ending in a PASS/FAIL verdict against what a correct
verifier should do.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/runs` | `RunSpecInput` | 201, the `Run` (it continues in the background; follow it on `/ws?run=<id>`) |
| GET | `/api/runs` | `?limit=100&status=&verdict=&format=&wallet=&verifier=` | Runs, newest first |
| GET | `/api/runs/:id` | — | The `Run` |
| POST | `/api/runs/:id/cancel` | — | 202 |
| DELETE | `/api/runs/:id` | — | 204, the run and its events |
| GET | `/api/runs/:id/events` | — | Event summaries, in order |
| GET | `/api/runs/:id/report` | `?format=json`, `?redact=false` | A download: Markdown report (default) or `{ run, events }` JSON. Claim values and `tx_code` are redacted unless `redact=false` |

**`RunSpecInput`**

| Field | Values | Default |
|---|---|---|
| `typeId` | a credential type id | required |
| `wallet` | `reference-wallet`, `inji-wallet`, `inji-web`, `external-wallet` | `reference-wallet` |
| `verifier` | `inji-verify`, `reference-verifier` | `inji-verify` |
| `mode` | `openid4vp-cross-device`, `openid4vp-same-device`, `direct-share` | `openid4vp-cross-device` |
| `query` | `presentation_exchange`, `dcql` | `presentation_exchange` |
| `requestedClaims` | claim names to ask for (SD-JWT: the ones to disclose) | `[]` |
| `claims` | the values to issue | `{}` (must satisfy the type's required fields) |
| `txCode` | a transaction code the wallet must enter | none |
| `tamper` | `none`, `alter-claim`, `wrong-nonce`, `no-holder-proof`, `foreign-holder`, `self-signed-sdjwt` | `none` |
| `heldCredentialId` | present an already-held credential | none |
| `skipIssuance` | with `heldCredentialId` | `false` |

With `wallet` other than `reference-wallet`, the run pauses at `waiting` and its step carries an `action` (an
offer or request URI to show as a QR code) until a person's wallet responds or 10 minutes pass.

**`Run`** (abridged):

```json
{
  "id": "run-ch3oqa",
  "status": "completed",
  "spec": { "typeId": "…", "wallet": "reference-wallet", "verifier": "inji-verify", "mode": "openid4vp-cross-device",
            "query": "presentation_exchange", "requestedClaims": ["primaryCropType"], "claims": { "…": "…" }, "tamper": "none" },
  "labels": { "issuerName": "…", "typeName": "Karnataka Farmer Card", "format": "ldp_vc", "dataModel": "2.0",
              "proofType": "Ed25519Signature2020", "wallet": "Reference Wallet", "verifier": "Inji Verify 0.18.2", "versions": { "…": "…" } },
  "steps": [{ "name": "issue", "status": "passed", "note": "Credential received and bound to did:key:…", "startedAt": "…", "endedAt": "…" }, "…"],
  "offerUri": "openid-credential-offer://?credential_offer_uri=…",
  "requestUri": "openid4vp://authorize?…",
  "result": {
    "verdict": "PASS", "expected": "PASS", "verifierOutcome": "ACCEPTED", "credentialStatus": "SUCCESS",
    "errorCode": null, "errorDetail": null,
    "explanation": "Inji Verify accepted the presentation: every check passed.",
    "checks": [{ "name": "Issuer signature & schema", "ok": true }, "…"]
  }
}
```

`status` is `running`, `waiting`, `completed`, `failed` (the journey stopped early) or `cancelled`.
`verifierOutcome` is `ACCEPTED`, `REJECTED`, `ERROR` or `NOT_REACHED`. `verdict` is `PASS` when the outcome
matches `expected`, so a tampered presentation that is rejected is a PASS.

## Protocol events

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/events` | `?run=<id>` or `?run=none` (unattributed), `?limit=200` | Event summaries, newest first |
| GET | `/api/events/:id` | `?reveal=1` | The full event with request and response. Secrets are masked unless `reveal=1` **and** the request comes from loopback |

An event summary: `{ id, runId, seq, at, durationMs, from, to, actor, method, path, status, title, phase, labels }`.
`from`/`to` are parties: `studio`, `certify`, `wallet`, `verifier-ui`, `verifier-backend`, `inji-verify`,
`reference-verifier`. The full event adds `request` and `response`, each `{ headers, body? , text? }`. Masked
keys: `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`, `authorization`, `cookie`,
`set-cookie`, `code`, `response_code`. Each is shown as its first and last four characters.

## Reference Wallet

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/wallet/credentials` | — | Held credentials (summaries) |
| GET | `/api/wallet/credentials/:id` | — | The summary plus `credential` (raw) and `claims` (decoded, SD-JWT disclosures expanded) |
| DELETE | `/api/wallet/credentials/:id` | — | 204 |
| POST | `/api/wallet/receive` | `{ offerUri, txCode? }` | 201, the held credential. Works with any OpenID4VCI pre-authorized offer, including other issuers' |
| POST | `/api/wallet/present` | `{ requestUri, heldId?, tamper? }` | `{ status, verifierResponse, disclosed, withheld, matches, request: { clientId, transport, signed, language } }`. Answers any OpenID4VP request: Inji Verify's, the Reference Verifier's or an external verifier's |
| GET | `/api/ref-verifier/sessions/:id` | — | A Reference Verifier session with its result and every check |

## Insights

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{ ok: true }` (liveness; touches nothing else) |
| GET | `/api/status` | — | `{ publicBaseUrl, mode: local\|public, phoneReady, identifiers, services: { certify, verify }, versions, retentionDays }` |
| GET | `/api/matrix` | — | `[{ key, run }]`: the latest finished run per credential × format × wallet × verifier × mode × query × tamper |
| GET | `/api/capabilities` | — | `{ claimed: { issuer, verifier }, proven: [{ verifier, format, proof, mode, query, accepted, rejected, lastRun }], studioTypes }`: what Certify and Verify advertise against what honest runs showed |
| POST | `/api/qr-lab` | `{ heldId }` or `{ credential }`, `stripPhoto?` | A QR measurement (below) |
| POST | `/api/qr-lab/synthetic` | `{ photoKb: 0–64 }` | The same for a synthetic credential with a face image of that size |
| POST | `/api/qr-lab/offer` | `{ uri }` | `{ chars, versions: { L, M, Q, H } }` for an offer or request URI |

A QR measurement:

```json
{
  "rawBytes": 1956, "pixelpassChars": 2088, "ratio": 1.07,
  "versions": { "L": { "raw": 32, "pixelpass": 27 }, "M": { "raw": 36, "pixelpass": 31 }, "Q": { "…": "…" }, "H": { "…": "…" } },
  "limits": [{ "id": "verify-scan", "label": "Inji Verify camera scan", "maxVersion": 27, "source": "Inji Verify docs: Features", "fits": true }, "…"],
  "qrPng": "data:image/png;base64,…"
}
```

`null` as a version means the payload fits no QR code at that error-correction level.

## Recording gateway (`/pub/certify/*`, `/pub/verify/*`)

The gateway forwards an allow-listed set of wallet-facing endpoints, records each exchange and returns the
upstream response unchanged (cookies included). Everything else answers:

```json
404 { "error": "not_exposed", "error_description": "POST /pub/certify/v1/certify/credential-configurations is not a wallet-facing endpoint, so the playground gateway does not expose it." }
```

If the upstream is down: `502 { "error": "upstream_unavailable" }`. `OPTIONS` preflights are answered by the
gateway, which allows credentials for the Verify SDK.

**`/pub/certify/*` → Inji Certify.** `credential_issuer` is `<base>/pub/certify`, so `<issuer>/.well-known/*`
is mapped to Certify's `/v1/certify/.well-known/*`, as upstream's nginx does.

| Method | Path after `/pub/certify` |
|---|---|
| GET | `/.well-known/openid-credential-issuer`, `/.well-known/oauth-authorization-server`, `/.well-known/did.json`, `/.well-known/jwks.json` (also under `/v1/certify/` and `/v1/certify/issuance/`) |
| GET | `/v1/certify/credential-offer-data/:id` |
| POST | `/v1/certify/oauth/token` |
| POST | `/v1/certify/issuance/credential`, `/v1/certify/issuance/vd11/credential`, `/v1/certify/issuance/vd12/credential` |
| GET | `/v1/certify/credentials/status-list/:id` |
| GET | `/v1/certify/rendering-template/:id` |

**`/pub/verify/*` → Inji Verify.**

| Method | Path after `/pub/verify` |
|---|---|
| POST | `/v1/verify/vp-request`, `/v1/verify/vp-session-request` |
| GET | `/v1/verify/vp-request/:id` (signed request object, when Verify issued a `requestUri`), `/v1/verify/vp-request/:id/status` |
| POST | `/v1/verify/vp-submission/direct-post` |
| GET | `/v1/verify/vp-result/:transactionId` |
| POST | `/v1/verify/v2/vp-results/:transactionId`, `/v1/verify/vp-session-results` |
| POST | `/v1/verify/vc-verification`, `/v1/verify/v2/vc-verification`, `/v1/verify/vc-submission` |
| GET | `/v1/verify/did.json`, `/v1/verify/.well-known/did.json` |
| GET | `/v1/verify/vp-definition/:id`, `/v1/verify/vp-definitions/:id` |

Two optional request headers help attribution; the gateway strips them before forwarding:
`x-playground-run: <run id>` and `x-playground-actor: <wallet name>`.

## Reference Verifier (`/pub/ref-verifier/*`)

| Method | Path | What |
|---|---|---|
| GET | `/pub/ref-verifier/did.json` | Its DID document (`did:web:<host>:pub:ref-verifier`, one Ed25519 JWK) |
| GET | `/pub/ref-verifier/requests/:id` | The signed request object (`application/oauth-authz-req+jwt`, EdDSA, `client_id_scheme=did`, 10-minute expiry) with PE or DCQL. Only for sessions created with `signed: true`; runs currently send unsigned requests by value, with `client_id` = the response URI |
| POST | `/pub/ref-verifier/response/:id` | `direct_post` endpoint for `vp_token` + `presentation_submission` (form-encoded). Answers `{}` and verifies; the result is at `/api/ref-verifier/sessions/:id` |

Sessions are created by runs (`verifier: "reference-verifier"`).

## Public documents

All are `GET`, unauthenticated, with `access-control-allow-origin: *` where browsers need it.

| Path | Content |
|---|---|
| `/pub/issuers/:slug` | Issuer profile document (name, colours, logo) |
| `/pub/issuers/:slug/did.json` | The issuer's DID document (`did:web:<host>:pub:issuers:<slug>` in tunnel mode) |
| `/pub/issuers/:slug/keys/:alg` | One verification method (`EdDSA`, `RS256`, `ES256`, `ES256K`) with `publicKeyPem` added (G2). 404 `no_key` until a type uses that algorithm |
| `/pub/issuers/:slug/logo.svg` | Generated logo |
| `/pub/issuers/:slug/types/:Type`, `/pub/vct/:id` | SD-JWT VC type metadata at the type's `vct` |
| `/pub/issuers/:slug/vocab` | The vocabulary base the contexts point at |
| `/pub/contexts/:slug/:Type.jsonld` | The JSON-LD context defining a Studio type's terms |

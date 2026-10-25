# API

The playground serves three kinds of HTTP routes on one origin (`http://localhost:8080` by default):

- **`/api/*`**: the BFF API that the UI uses. It takes and returns JSON. It has no authentication and is meant
  for this machine only. In tunnel mode, the public URL doesn't reach it unless `PUBLIC_UI=true` (see
  [security-privacy.md](security-privacy.md)).
- **`/pub/*`**: the wallet-facing surface. It covers the recording gateway to Inji Certify and Inji Verify, the
  Reference Verifier, and the public documents (DID documents, keys, contexts and type metadata). It has no
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
| 400 | `validation_failed` | The body failed schema validation. `issues` lists each field. |
| 400 | `invalid_json` | The body is not JSON |
| 400 | `invalid_request`, `invalid_offer` | A required field is missing |
| 404 | `not_found`, `run_not_found`, `event_not_found` | Unknown id (events may have been purged) |
| 409 | `type_exists` and similar | A Studio conflict, such as a type name that the issuer already uses |
| 400 | `unsupported`, `invalid_claims` | A run combination that cannot work, or claim values that do not fit an external type |
| 404 | `unknown_type`, `unknown_wallet`, `unknown_verifier` | A run names something neither built in nor in the parties file |
| 409 | `not_waiting` | `/api/runs/:id/input` for a run that is not waiting |
| 502 | upstream code or `upstream_error` | Certify or Verify answered with an error. `detail` carries their body. |
| 502 | `step_failed`, `unreachable` | An external party's step answered with an unexpected status or could not be reached. `detail` carries its answer. |
| 500 | `internal_error` | A bug. The log has the details. |

An unknown `/api` path answers `404 {"error":"not_found"}`.

## Issuer Studio

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/issuers` | none | Issuer profiles, each with its `types` |
| POST | `/api/issuers` | `IssuerProfileInput` | 201, the profile |
| GET | `/api/issuers/:slug` | none | The profile with its `types` |
| PUT | `/api/issuers/:slug` | `IssuerProfileInput` | The profile; its types are re-synced to Certify |
| DELETE | `/api/issuers/:slug` | none | 204 |
| GET | `/api/types` | none | Every credential type |
| POST | `/api/types/preview` | `CredentialTypeInput` | What Certify would receive (configuration, Velocity template, JSON-LD context), without saving |
| POST | `/api/types` | `CredentialTypeInput` | 201, the type, after Certify has accepted it and advertises it in its issuer metadata |
| GET | `/api/types/:id` | none | The type plus `advertised` (whether Certify's metadata lists it right now) |
| PUT | `/api/types/:id` | `CredentialTypeInput` | The type, updated in Certify |
| DELETE | `/api/types/:id` | none | 204 |
| POST | `/api/types/:id/offers` | `{ claims, txCode?, expiresIn? }` | 201, `{ offerUri }`, a standalone `openid-credential-offer://` URI for any wallet |
| GET | `/api/studio/options` | none | `{ ldpSuites: [{suite, alg}], sdJwtAlgs }` |
| POST | `/api/studio/reconcile` | none | `{ created, updated, … }`. It makes Certify's configurations match the store. This also runs at start-up. |

**`IssuerProfileInput`**

| Field | Type | Notes |
|---|---|---|
| `slug` | string | 3 to 32 lowercase letters, digits or dashes. It is part of every public URL. |
| `name` | string | 2 to 80 characters |
| `description` | string | ≤ 280 |
| `logoUrl` | URL or `""` | If empty, `/pub/issuers/<slug>/logo.svg` is generated from the initials |
| `backgroundColor`, `textColor` | `#RRGGBB` | Card colours in wallets |

**`CredentialTypeInput`**

| Field | Type | Default | Notes |
|---|---|---|---|
| `issuerSlug` | string | none | An existing issuer |
| `typeName` | PascalCase | none | The VC `type` (JSON-LD) or the last part of the `vct` (SD-JWT) |
| `displayName`, `description` | string | none | Shown in wallets |
| `format` | `ldp_vc` \| `vc+sd-jwt` | none | |
| `dataModel` | `1.1` \| `2.0` | `2.0` | JSON-LD only |
| `ldpSuite` | see `/api/studio/options` | `Ed25519Signature2020` | JSON-LD only |
| `sdJwtAlg` | `ES256` \| `EdDSA` \| `RS256` \| `ES256K` | `ES256` | SD-JWT only |
| `fields` | `FieldDef[]` | none | 1 to 30, with unique names |
| `revocable` | boolean | `false` | Adds a status-list entry. Certify does this for VCDM 2.0 only. |
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

A run is one journey: issue, request, present and verify. It ends in a PASS or FAIL verdict against what a correct
verifier should do.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/runs` | `RunSpecInput` | 201, the `Run`. It continues in the background, so follow it on `/ws?run=<id>`. |
| GET | `/api/runs` | `?limit=100&status=&verdict=&format=&wallet=&verifier=` | Runs, newest first |
| GET | `/api/runs/:id` | none | The `Run` |
| POST | `/api/runs/:id/cancel` | none | 202 |
| DELETE | `/api/runs/:id` | none | 204, the run and its events |
| GET | `/api/runs/:id/events` | none | Event summaries, in order |
| POST | `/api/runs/:id/input` | `{ offerUri }` or `{ confirm: true }` | 202. Gives a waiting step what it asked for. That is either a pasted offer (`paste-offer`) or *Continue* (steps marked `needsConfirm`, which an external party completes out of the playground's sight). 400 for something that is not an offer. 409 when the run is not waiting. |
| GET | `/api/runs/:id/report` | `?format=json`, `?redact=false` | A download: the Markdown report (the default) or `{ run, events }` as JSON. Claim values and `tx_code` are redacted unless `redact=false`. |

**`RunSpecInput`**

| Field | Values | Default |
|---|---|---|
| `typeId` | a Studio credential type id, `ext:<issuer>/<type>` from the parties file, or `hosted:<environment>/<issuer>/<configuration id>` for a MOSIP Collab credential (see `/api/catalog`) | required |
| `wallet` | `reference-wallet`, `inji-wallet`, `external-wallet`, or a wallet id from the parties file. `inji-web` is refused, because it has no offer support. | `reference-wallet` |
| `verifier` | `inji-verify`, `reference-verifier`, `collab-verify` (Inji Verify 1.0 on MOSIP Collab, DCQL only), or a verifier id from the parties file | `inji-verify` |
| `mode` | `openid4vp-cross-device`, `openid4vp-same-device`, `direct-share` | `openid4vp-cross-device` |
| `query` | `presentation_exchange`, `dcql` | `presentation_exchange` |
| `requestedClaims` | claim names to ask for (SD-JWT: the ones to disclose) | `[]` |
| `claims` | the values to issue | `{}` (must satisfy the type's required fields) |
| `txCode` | a transaction code the wallet must enter | none |
| `tamper` | `none`, `alter-claim`, `wrong-nonce`, `no-holder-proof`, `foreign-holder`, `self-signed-sdjwt` | `none` |
| `verifyRequest` | Inji Verify only: `signed` (`client_id` is Verify's DID, with a signed request object fetched by `request_uri`) or `by-value` (`client_id` is `inji-playground`, with the request in the URI) | `signed` |
| `login` | Collab issuers only: `{ mode: "auto" \| "interactive", individualId? }`. With `auto`, the Reference Wallet signs in at eSignet with a demo UIN (by default the environment's first) and the static OTP. With `interactive`, the run pauses at a `login` step and the person signs in, in a browser tab | `{ mode: "auto" }` |
| `dcqlPaths` | DCQL claim paths for W3C credentials: `spec` (from the credential's root, OpenID4VP 1.0 B.1.2) or `inji` (from `credentialSubject`, which is what Inji Verify 1.0 reads, gap G36) | `spec` |
| `heldCredentialId` | present an already-held credential | none |
| `skipIssuance` | with `heldCredentialId` | `false` |

Combinations that cannot work are refused with a 400 and the reason. Examples are tampering with any wallet
other than the Reference Wallet, direct share with a verifier other than Inji Verify or with an API-driven
wallet, and asking an external verifier for a format it is not configured for.

With any `wallet` other than `reference-wallet`, the run pauses at `waiting`. Its step carries an `action` (an
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
matches `expected`. So a tampered presentation that is rejected counts as a PASS.

## Protocol events

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/events` | `?run=<id>` or `?run=none` (unattributed), `?limit=200` | Event summaries, newest first |
| GET | `/api/events/:id` | `?reveal=1` | The full event with request and response. Secrets are masked unless you pass `reveal=1` **and** the request comes from loopback. |

An event summary: `{ id, runId, seq, at, durationMs, from, to, actor, method, path, status, title, phase, labels }`.
`from` and `to` are parties: `studio`, `certify`, `wallet`, `verifier-ui`, `verifier-backend`, `inji-verify` or
`reference-verifier`. The full event adds `request` and `response`, each `{ headers, body? , text? }`. These keys
are masked: `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`, `authorization`, `cookie`,
`set-cookie`, `code` and `response_code`. Each one is shown as its first and last four characters.

## Reference Wallet

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/wallet/credentials` | none | Held credentials (summaries) |
| GET | `/api/wallet/credentials/:id` | none | The summary, plus `credential` (raw) and `claims` (decoded, with SD-JWT disclosures expanded) |
| DELETE | `/api/wallet/credentials/:id` | none | 204 |
| POST | `/api/wallet/receive` | `{ offerUri, txCode? }` | 201, the held credential. It works with any OpenID4VCI pre-authorized offer, including other issuers' offers. |
| POST | `/api/wallet/present` | `{ requestUri, heldId?, tamper? }` | `{ status, verifierResponse, disclosed, withheld, matches, request: { clientId, transport, signed, language } }`. It answers any OpenID4VP request: Inji Verify's, the Reference Verifier's or an external verifier's. |
| GET | `/api/ref-verifier/sessions/:id` | none | A Reference Verifier session with its result and every check |

## Parties (external issuers, wallets and verifiers)

These are declared in `infra/parties.yaml` (the container reads `PARTIES_FILE`) and loaded at start-up.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/api/parties` | none | `{ file, loadedAt, errors, health, issuers, verifiers, wallets }`. `wallets` and `verifiers` include the built-in ones (`origin: builtin` or `external`). `issuers` are the external ones, with their `types`. `health` maps `issuer:<id>`, `verifier:<id>` and `wallet:<id>` to `{ ok, detail }`. Step definitions are **not** returned, because their bodies can hold an issuer's signing key or a wallet password. |
| GET | `/api/catalog` | none | Every credential type a run can use, from Studio and from external issuers, as `CatalogType` (`id`, `origin`, `issuerId`, `issuerName`, `displayName`, `format`, `typeName`/`vct`, `proof`, `fields`, `canIssue`, `configurationId`) |
| POST | `/api/parties/issuers/:issuer/types/:type/offers` | `{ claims?, txCode? }` | 201, `{ offerUri }`, from the issuer's offer steps (missing claims take the file's samples). 400 when the issuer has no offer steps. 502 when the steps fail. |

## Hosted environments (MOSIP Collab)

These are declared in the `environments:` section of `infra/parties.yaml`. At start-up and on refresh, the BFF
reads each environment's Mimoto issuer list, every issuer's OpenID4VCI metadata and its verifier's health. Their
credential types appear in `/api/catalog` with `origin: hosted`. Collab's Inji Verify 1.0 is the verifier
`collab-verify`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/hosted` | none | `{ environments, health }`. Each environment has `id`, `name`, `version`, `mimoto`, `issuers` (with their credential types and who can collect them), `verifier`, `client` (client id, redirect URI, `ready`, and why not) and `testData` (demo identities, the static OTP, notes per issuer, and how to register a UIN). The client's key is never returned. |
| POST | `/api/hosted/refresh` | none | Re-reads Mimoto and the issuers' metadata. Same shape as GET. |
| POST | `/api/hosted/collect` | `{ typeId, login? }` (`login` as in a run) | 202, a job `{ id, status: signing-in \| waiting-login \| collecting \| done \| failed, loginUrl?, held?, error? }`. The Reference Wallet collects the credential outside a run. An automatic sign-in finishes in seconds. An interactive one answers once eSignet's page is known (`loginUrl`). |
| GET | `/api/hosted/collect/:id` | none | The job (kept 30 minutes) |

**Redirect app (port 3004).** MOSIP's `wallet-demo` client only allows `http://localhost:3004/redirect`. So the BFF
serves a second tiny app on `127.0.0.1:3004` (`OAUTH_REDIRECT_PORT`). `GET /redirect?code=…&state=…` hands the code
to the run or collection that is waiting for that `state`, and shows a "Signed in" page. Any other path gets a 404.
Any `state` the playground did not start gets a 400. The tunnel does not reach this app.

## Insights

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | none | `{ ok: true }`. This is a liveness check and touches nothing else. |
| GET | `/api/status` | none | `{ hosted: [{ id, name, reachable, issuers, types }], publicBaseUrl, mode: local\|public, phoneReady, identifiers, services: { certify, verify }, versions, verifyClientIds: { signed, byValue }, retentionDays, parties: { file, errors, configured, reachable } }` |
| GET | `/api/matrix` | none | `[{ key, run }]`, the latest finished run for each combination of credential, format, wallet, verifier, mode, query and tamper |
| GET | `/api/capabilities` | none | `{ claimed: { issuer, verifier }, proven: [{ verifier, format, proof, mode, query, accepted, rejected, lastRun }], studioTypes }`. It compares what Certify and Verify advertise with what honest runs showed. |
| POST | `/api/qr-lab` | `{ heldId }` or `{ credential }`, `stripPhoto?` | A QR measurement (below) |
| POST | `/api/qr-lab/synthetic` | `{ photoKb: 0 to 64 }` | The same, for a synthetic credential with a face image of that size |
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

The gateway forwards an allow-listed set of wallet-facing endpoints. It records each exchange and returns the
upstream response unchanged, cookies included. Everything else gets this answer:

```json
404 { "error": "not_exposed", "error_description": "POST /pub/certify/v1/certify/credential-configurations is not a wallet-facing endpoint, so the playground gateway does not expose it." }
```

If the upstream is down, the answer is `502 { "error": "upstream_unavailable" }`. The gateway answers `OPTIONS`
preflights itself, and it allows credentials for the Verify SDK.

**`/pub/certify/*` goes to Inji Certify.** `credential_issuer` is `<base>/pub/certify`, so `<issuer>/.well-known/*`
is mapped to Certify's `/v1/certify/.well-known/*`, as upstream's nginx does.

| Method | Path after `/pub/certify` |
|---|---|
| GET | `/.well-known/openid-credential-issuer`, `/.well-known/oauth-authorization-server`, `/.well-known/did.json`, `/.well-known/jwks.json` (also under `/v1/certify/` and `/v1/certify/issuance/`) |
| GET | `/v1/certify/credential-offer-data/:id` |
| POST | `/v1/certify/oauth/token` |
| POST | `/v1/certify/issuance/credential`, `/v1/certify/issuance/vd11/credential`, `/v1/certify/issuance/vd12/credential` |
| GET | `/v1/certify/credentials/status-list/:id` |
| GET | `/v1/certify/rendering-template/:id` |

**`/pub/verify/*` goes to Inji Verify.**

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

Two optional request headers help attribution. The gateway strips them before forwarding:
`x-playground-run: <run id>` and `x-playground-actor: <wallet name>`.

## Reference Verifier (`/pub/ref-verifier/*`)

| Method | Path | What |
|---|---|---|
| GET | `/pub/ref-verifier/did.json` | Its DID document (`did:web:<host>:pub:ref-verifier`, one Ed25519 JWK) |
| GET | `/pub/ref-verifier/requests/:id` | The signed request object (`application/oauth-authz-req+jwt`, EdDSA, `client_id_scheme=did`, 10-minute expiry) with PE or DCQL. Only for sessions created with `signed: true`. Runs currently send unsigned requests by value, with `client_id` set to the response URI. |
| POST | `/pub/ref-verifier/response/:id` | The `direct_post` endpoint for `vp_token` and `presentation_submission` (form-encoded). It answers `{}` and verifies. The result is at `/api/ref-verifier/sessions/:id`. |

Sessions are created by runs (`verifier: "reference-verifier"`).

## Public documents

All of these are `GET` routes with no authentication. They send `access-control-allow-origin: *` where browsers need it.

| Path | Content |
|---|---|
| `/pub/issuers/:slug` | Issuer profile document (name, colours, logo) |
| `/pub/issuers/:slug/did.json` | The issuer's DID document (`did:web:<host>:pub:issuers:<slug>` in tunnel mode) |
| `/pub/issuers/:slug/keys/:alg` | One verification method (`EdDSA`, `RS256`, `ES256`, `ES256K`) with `publicKeyPem` added (G2). It answers 404 `no_key` until a type uses that algorithm. |
| `/pub/issuers/:slug/logo.svg` | Generated logo |
| `/pub/issuers/:slug/types/:Type`, `/pub/vct/:id` | SD-JWT VC type metadata at the type's `vct` |
| `/pub/issuers/:slug/vocab` | The vocabulary base the contexts point at |
| `/pub/contexts/:slug/:Type.jsonld` | The JSON-LD context defining a Studio type's terms |

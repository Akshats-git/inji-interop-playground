# Interoperability gaps found with the playground

These are real problems the playground surfaced while wiring released Inji modules together, (G29–G35) while
connecting them to parties that are not Inji (the walt.id issuer, verifier and wallet declared in
[infra/parties.yaml](../infra/parties.yaml)), and (G36–G41) while connecting to **MOSIP Collab**, MOSIP's hosted
sandbox running the Inji **1.0.0-alpha.1** line. Each names the issuer, wallet and verifier it was found
against, with evidence, a way to reproduce it and the workaround the playground applies.

Versions:
- **bundled:** Inji Certify 0.14.0 and Inji Verify 0.18.2 (released images, unmodified), the Verify React SDK
  0.18.1 and vc-verifier 1.8.1 (inside Verify);
- **MOSIP Collab, checked 23 Oct 2026:** Inji Verify 1.0.0-alpha.1 at `injiverify.collab.mosip.net`, Inji Certify
  issuers of the 1.0 line (`injicertify-mock`, `-farmer`, `-landregistry`, `-mdl`, `-mosipid`, `-insurance`) and of
  the 0.x line (`-truckpass`, `-globalid`, `-tan`), eSignet at `esignet-mock.collab.mosip.net`, and Mimoto at
  `api.collab.mosip.net`.

**Severity:** **High** means it breaks a mainstream flow or weakens a security property. **Medium** means it
breaks a standards-valid variant. **Low** means misleading behaviour or a papercut.

**Evidence:**
- **Matrix Mx/Tx/Xx/Cx** is a row of the automated matrix ([interop-report.md](interop-report.md)), regenerated on
  every run. C rows use MOSIP Collab: the Reference Wallet signs in at Collab's eSignet with a published demo UIN
  and the static test OTP.
- **Run `run-…`** is a playground run you can open at `/runs/<id>` (runs are purged after `RETENTION_DAYS`).
- **Probe** is a direct HTTP call, given in the reproduction steps.
- **Workaround** means the playground ships a fix in its configuration or code. Removing the fix brings the
  failure back; these were reproduced while building Phases 1–4.

**Report** says where each gap should go: a **private** report to the MOSIP maintainers (security or privacy),
a **public issue** on the named repository, or **docs** (an update to the deployment docs or Compose files).

## Summary

| # | Component | Gap | Severity | Evidence | Report |
|---|---|---|---|---|---|
| G1 | Inji Verify / vc-verifier | A W3C-valid `issuer` **object** (`{"id": …, "name": …}`) is rejected with `ERR_INVALID_ISSUER` | Medium | Run `run-x5rtnq` (rejected) vs `run-pfofcw` (Reference Verifier accepts the same credential) | Public issue (inji-verify) |
| G2 | vc-verifier | The HTTP(S) key resolver reads `publicKeyPem` whatever the key format, so URL-hosted `publicKeyMultibase` / `publicKeyJwk` keys never resolve | Medium | Workaround: [studio/service.ts](../apps/bff/src/studio/service.ts) publishes `publicKeyPem` | Public issue (vc-verifier) |
| G3 | Certify (injistack Compose) | `certify_init.sql` at v0.14.0 has the pre-0.13 schema (`capacity` vs `capacity_in_kb`): every **revocable** credential fails with HTTP 500 | High | Workaround: [01-certify.sql](../infra/postgres/init/01-certify.sql) | Public issue (inji-certify) |
| G4 | Inji Verify (Compose) | `db-init/init.sql` at v0.18.2 lacks `vp_submission.response_code*`: **every OpenID4VP submission** fails with HTTP 500 | High | Workaround: [02-verify.sql](../infra/postgres/init/02-verify.sql) | Public issue (inji-verify) |
| G5 | Certify (injistack Compose) | The default cache list lacks `credentialOfferCache`: `/pre-authorized-data` fails ("credentialOfferCache not available"), so the pre-authorized flow does not work out of the box | High | Workaround: [certify-playground.properties](../infra/certify/certify-playground.properties) | Public issue (inji-certify) |
| G6 | Certify | Errors come back as HTTP **200** with an `errors[]` envelope (`/pre-authorized-data`, `/actuator/health`); health checks and clients that trust status codes are misled | Low | Probe (below); workaround: the Compose health check reads issuer metadata | Public issue (inji-certify) |
| G7 | Certify | Any `CertifyException` during issuance is re-labelled `ERROR_SIGNING_QR_DATA` (e.g. a JSON-LD context that fails to load) | Low | Run `run-ch3oqa` message 6: `ERROR_SIGNING_QR_DATA` / "Error occurred during canonicalization" | Public issue (inji-certify) |
| G8 | Certify | Velocity templates have no JSON escaping helper (`$_esc.json` is unavailable); templates written like the samples (`"${fullName}"`) let a claim value containing `"` break or inject JSON | Medium (security) | Workaround: [core/studio.ts](../packages/core/src/studio.ts) escapes through `$_esc.java` | Private, then public |
| G9 | Certify | `sdJwtClaims` rejects `mandatory`, yet the pre-authorized validator reads `mandatory` from it, so mandatory SD-JWT claims cannot be configured through the API | Low | Probe (Phase 1); the Studio omits `mandatory` | Public issue (inji-certify) |
| G10 | Certify | SD-JWT VCs carry no `iat`/`exp`/`nbf` (no expiry can be enforced) and are signed with the default self-signed `www.example.com (ROOT)` certificate in `x5c`. **Same on Collab's Certify 1.0** (`injicertify-mock`) | Medium | Probe of the Matrix M3 credential (below); Matrix C14 (Collab's SD-JWT has no `exp`) | Public issue (inji-certify) |
| G11 | Inji Verify | SD-JWT issuer signatures are checked only against the `x5c` certificate the token itself carries, with no trust anchor: an SD-JWT **re-signed by an attacker** with a self-signed certificate is reported valid. **Still present in Inji Verify 1.0.0-alpha.1** on Collab | **High (security)** | Matrix T17 (0.18.2) and C18 (Collab, 1.0.0-alpha.1): accepted; T18 (Reference Verifier rejects) | **Private** |
| G12 | db_scripts | `certify-key_policy_def.csv` lacks `CERTIFY_VC_SIGN_EC_R1`, so ES256 signing fails on a database built from the release scripts; the DDL also relies on a fresh session's `search_path` | Low | Workaround: [01-certify.sql](../infra/postgres/init/01-certify.sql), [certify-default.properties](../infra/certify/certify-default.properties) | Public issue (inji-certify) |
| G13 | Inji PE dialect | Inji's presentation definitions filter `$.type` with `{"type":"object","pattern":…}`, which is not valid JSON Schema for an array; spec-style `contains/const` filters may not match in Inji wallets | Medium | Verifier desk shows both dialects; [core/query.ts](../packages/core/src/query.ts) `PeDialect` | Public issue (inji-verify) |
| G14 | Inji Verify | `/vc-verification` (v1) answers only `INVALID` with no reason; the reason is only available from `/v2/vc-verification` | Low | Probe (below) | Public issue (inji-verify) |
| G15 | Certify | A credential signed with `Ed25519Signature2020` is issued without that suite's `@context` (lenient JSON-LD processing drops the undefined proof terms); strict processors cannot check it. **Every Collab ldp_vc issuer does this** (Certify 1.0 line, VCDM 1.1 and 2.0), so a strict wallet cannot even sign a presentation of it | Medium | Workaround: the Studio adds the suite context to every template; Matrix C15 (strict Reference Verifier rejects a Collab credential) | Public issue (inji-certify) |
| G16 | Certify | Standard JSON-LD contexts (`https://www.w3.org/ns/credentials/v2`, …) are fetched from the internet at **every signature**; a transient network error fails issuance (`Error occurred during canonicalization`). 1.0 adds a context loader | Medium | Run `run-ch3oqa` message 6 (failed, retried at message 7); the Reference Wallet and matrix retry once | Public issue (inji-certify) |
| G17 | vc-verifier | `did:web` identifiers with a port (`did:web:host%3A8080:…`, as the did:web spec requires) fail with `Invalid URL host` because `%3A` is not decoded | Low | Workaround: URL keys in local mode ([compose.yml](../infra/compose.yml)) | Public issue (vc-verifier) |
| G18 | Certify (injistack Compose) | The keystore volume is mounted at `/home/mosip/CERTIFY_PKCS12`, but the image runs from `/home/inji`, so keys are **not persisted**: after a container re-create Certify refuses to start (`KER-KMA-004 No such alias`) until the database is wiped | High | Workaround: [compose.yml](../infra/compose.yml) mounts `/home/inji/CERTIFY_PKCS12` | Public issue (inji-certify) |
| G19 | Inji Verify 0.18.2 | For SD-JWT presentations the **KB-JWT nonce is not compared with the request nonce** (the nonce check only covers JSON-LD VPs): a stale or replayed SD-JWT presentation is accepted. **Fixed in 1.0.0-alpha.1** (Collab rejects it) | **High (security)** | Matrix T6, run `run-fdmznq` (accepted); T5, T8 and C16 (Collab) reject | **Private** |
| G20 | Inji Verify 0.18.2 | An SD-JWT presented **without any KB-JWT** is accepted even when the request has `acceptVPWithoutHolderProof=false`. **Fixed in 1.0.0-alpha.1** (Collab rejects it) | **High (security)** | Matrix T10, run `run-umpygq` (accepted); T9, T12 and C17 (Collab) reject | **Private** |
| G21 | Inji Verify | When a credential's status list cannot be resolved, the whole presentation fails with an opaque `VP_VERIFICATION_FAILED` ("runtime exception") instead of a status-check error | Low | Observed in Phase 2 (below) | Public issue (inji-verify) |
| G22 | Inji Verify | A DCQL request (`dcqlQuery`, the 1.0 shape) to 0.18.2 fails with `BOTH_ID_AND_PD_CANNOT_BE_NULL` rather than a clear "query language not supported", so integrators mixing versions get a misleading error. The other way round, 1.0.0-alpha.1 answers a Presentation Exchange request with `UNKNOWN_FIELD` | Low | Matrix M11 (0.18.2) and C9 (Collab, 1.0.0-alpha.1) | Public issue (inji-verify) |
| G23 | Certify | A template `validFrom` that is valid RFC 3339 but has no milliseconds (`2024-01-02T00:00:00Z`) makes issuance fail with HTTP 500 (`DateTimeParseException` in the ledger), so issuers cannot set their own validity dates freely | Low | Workaround: [core/studio.ts](../packages/core/src/studio.ts) keeps milliseconds | Public issue (inji-certify) |
| G24 | Certify | Each issued credential's type is written to `certify.ledger.credential_type`, a `varchar(100)`; for SD-JWT that is the `vct`. A URL `vct` on a longer host (101 chars on a quick tunnel) makes every issuance fail with `ERROR_SIGNING_QR_DATA` after a `value too long` SQL error | Medium | Matrix over a tunnel (Phase 4); workaround: short `/pub/vct/<id>` | Public issue (inji-certify) |
| G25 | Inji Verify + Verify SDK | Verify returns a `requestUri` (a signed request object) only when `clientId` is its own DID. With any other client id it returns the request by value, and the SDK builds a 1,191-character `openid4vp://` URL (QR version 28 at the SDK's level M) for a one-field request: unsigned, and denser than Inji Verify's own camera limit (v27) | Medium | Probe (below) | Public issue (inji-verify) |
| G26 | Certify (SD-JWT) + QR | A 5-claim SD-JWT VC from Certify is 4,545 characters, 73 % of it the two-certificate `x5c` chain in the header, so it **fits no QR code** (PixelPass makes it 5 % larger). A JSON-LD credential with a 1 KB photo already needs QR v27 (Inji Verify's camera limit), and above ~2.4 KB nothing fits | Medium | QR Lab probes (below) | Public issue (inji-certify) |
| G27 | Certify | In the pre-authorized flow the access token's `sub` is the **whole claim set as JSON** (name, IDs, every attribute), so personal data travels in a bearer JWT that proxies, logs and APM tools routinely record | Medium (privacy) | Probe (below) | **Private** |
| G28 | Certify | Concurrent pre-authorized issuances intermittently fail with `invalid_proof`, although each proof JWT carries the `c_nonce` its own token response returned and uses its own holder key | Low | Runs `run-c7mbyq`, `run-izg6ca` (failed) next to `run-hkvnrw`; `run-jg3rbg` (below) | Public issue (inji-certify), after confirming |
| G29 | Inji Verify React SDK | `QRCodeVerification` refuses uploaded images under **10 KB** ("File size not supported. The file size should be between 10 KB and 5 MB"). A plain QR PNG is usually smaller: two of the four sample QR codes in Inji Verify's own docs (3.4 KB and 4.4 KB) cannot be uploaded | Low | Probe on the Verifier desk (below) | Public issue (inji-verify) |
| G30 | walt.id wallet-api 1.0 ↔ Certify | walt.id's wallet reads every credential configuration's `claims` as an mdoc-style namespace map. Certify's SD-JWT configurations use the draft-13 shape (`{"fullName": {"display": […]}}`), so parsing the **whole** metadata fails and the wallet can collect **no** Certify credential, JSON-LD ones included, while Certify advertises any SD-JWT type | Medium | Matrix X11, X12 (below) | Public issue (walt-id/waltid-identity) |
| G31 | walt.id verifier-api 1.0 | A key-binding JWT without a `kid` header is refused ("No key ID found in JWT header"), although the holder key is the one in `cnf` and SD-JWT does not require `kid` | Low | Workaround: the Reference Wallet sets `kid` ([presentation.ts](../apps/bff/src/reference/wallet/presentation.ts)) | Public issue (walt-id/waltid-identity) |
| G32 | Certify ↔ walt.id verifier-api 1.0 | Certify binds SD-JWTs to the holder with `cnf: {"kid": "did:jwk:…"}`; walt.id's verifier only reads `cnf.jwk` and fails with a `NullPointerException`, so **no Certify SD-JWT verifies at walt.id**. Both forms are allowed by RFC 7800; the SD-JWT VC drafts show `cnf.jwk` | Medium | Matrix X10 | Public issue (walt.id); note to inji-certify |
| G33 | walt.id wallet-api 1.0 (and Inji Verify's leniency) | walt.id's wallet sets `presentation_submission.descriptor_map[].id` to the presentation **definition** id instead of the **input descriptor** id that Presentation Exchange requires. Inji Verify 0.18.2 accepts it without checking; the Reference Verifier rejects it | Low | Matrix X9 (rejected) vs X7 (Inji Verify accepts) | Public issue (walt.id); mention to inji-verify |
| G34 | walt.id wallet-api 1.0 | `matchCredentialsForPresentationRequest` returns `[]` for an Inji Verify request the same wallet resolves without trouble; matching on the resolved `presentation_definition` finds the credential | Low | Workaround: two steps in [parties.yaml](../infra/parties.yaml) | Public issue (walt-id/waltid-identity) |
| G35 | walt.id wallet-api 1.0 ↔ Inji Verify | walt.id's wallet fetches a `request_uri` with `Accept: application/json` only. Inji Verify serves the signed request object only as `application/oauth-authz-req+jwt` and answers **406 Not Acceptable**, so walt.id's wallet cannot answer any **signed** Inji Verify request (it can answer the unsigned by-value form, X7) | Medium | Matrix X18 (fails), X7 (by value, accepted) | Public issue (walt.id); note to inji-verify (serve the JWT for `*/*`-style or JSON accepts too) |
| G36 | Inji Verify 1.0 (+ Inji's PEX→DCQL guide) | For W3C credentials, Verify 1.0 evaluates DCQL claim paths from `credentialSubject` (`["email"]`). OpenID4VP 1.0 (Appendix B.1.2) evaluates them from the credential's root (`["credentialSubject","email"]`). A spec-written query, from any relying party, makes Verify reject every honest presentation ("does not contain a required claim path"); Inji-style queries will not match in spec-following wallets | **High (interop)** | Matrix C3 (spec paths: rejected) vs C4 (Inji paths: accepted); probe below | Public issue (inji-verify) + docs |
| G37 | Mimoto config on Collab | Collab's Mimoto lists four issuers (Land, Mosip, StayProtected, MockMdl) with a `wellknown_endpoint` on the 0.x path `/v1/certify/issuance/.well-known/…`, which answers 404 since those issuers moved to the 1.0 line; the OpenID4VCI location works. Collab's mock issuer (named in the PS2 brief) is not listed at all | Low | Parties page notes; probe below | Docs / inji-config (collab) |
| G38 | Certify on Collab (mock issuer) | Credentials name `did:web:injicertify-mock.collab.mosip.net` as `issuer` but are signed by `did:web:inji.github.io:inji-config:collab:mock-identity#…`, a key whose controller is a different DID. A verifier that checks the signing key belongs to the issuer (as Data Integrity requires) must reject them; Inji Verify does not check | Medium | Probe below (decoded credential and both DID documents) | Public issue (inji-certify) / Collab config |
| G39 | Certify 0.x on Collab | TruckPass (and the other 0.x instances) advertise `Ed25519` as the only Ed25519 proof algorithm and refuse a proof JWT signed with `alg: EdDSA` ("Error encountered during proof jwt parsing"). `EdDSA` (RFC 8037) is what most wallets send and what Collab's 1.0 issuers advertise; `Ed25519` is the newer RFC 9864 name | Low | Probe below; workaround: the Reference Wallet picks an advertised name | Public issue (inji-certify) |
| G40 | Collab test data | The demo UINs MOSIP publishes for Collab do not all have records at its issuers: TruckPass has none (`ERROR_FETCHING_DATA_RECORD_FROM_TABLE`), Land registry only 2154189532 and 5614273165, the mDL issuer only 2154189532 (`ERROR_FETCHING_IDENTITY_DATA` for the rest) | Low | Checked 23 Oct 2026; the parties file's test data says which UIN works where | Docs |
| G41 | Collab Land registry (Certify 1.0) → Inji Verify 1.0 | Credentials from `injicertify-landregistry` are signed with key `did:web:inji.github.io:inji-config:collab:landregistry#0B6e9kc5…`, but that DID document lists only `#2Fx_l12c…`. Inji Verify 1.0 answers `PublicKeyResolutionFailedException` (HTTP 500 `VP_VERIFICATION_FAILED`), so **no verifier can check a Collab Land credential** | Medium | Matrix C7; probe below | Collab config (inji-config) / public issue (inji-certify) |

G36–G41 and the Collab notes on G10, G11, G15, G19, G20 and G22 were found on 23 Oct 2026 against MOSIP Collab
(Inji 1.0.0-alpha.1), with the playground running locally and connecting to it.

Every Matrix and Run reference above was produced or re-checked on 11 Oct 2026 with the local bundle.
The matrix run that day: 28 of 31 rows as expected, 3 known gaps (T6 = G19, T10 = G20, T17 = G11) and
0 unexpected.
On 12 Oct 2026 the matrix gained 17 rows with external parties (`./playground.sh up --external`): 40 of 48
rows as expected, 8 known gaps (T6, T10, T17, and X9 = G33, X10 = G32, X11 and X12 = G30, X14 = G11) and
0 unexpected.
On 19 Oct 2026 runs switched to Inji Verify's **signed** requests by default (its did:web as `client_id`, the
request fetched by `request_uri`); M14, M15 and X7 keep the by-value form. The matrix has 51 rows: 42 as
expected, 9 known gaps (the eight above plus X18 = G35) and 0 unexpected.

## Responsible disclosure

**G11, G19 and G20** are security weaknesses in a released verifier: together they let anyone with a copy of an
SD-JWT (or a self-made certificate) pass Inji Verify 0.18.2. Inji Verify 1.0.0-alpha.1 (on Collab) fixes G19 and
G20 but **still accepts the forged SD-JWT of G11**, so G11 affects the release line MOSIP is moving to. **G27** puts personal data into bearer tokens, and
**G8** is template injection in a misconfigured issuer. These go to the MOSIP team privately (security contact /
maintainers) before any public issue. The playground's tamper presets reproduce G11, G19 and G20 in one click
each.

This file describes them in enough detail to reproduce. **Before this repository is made public, the private
report must have been sent,** or these entries must be shortened to a one-line mention until the maintainers
agree to publication.

## How to reproduce

All steps assume `./playground.sh up` and the seeded demo content. "Run" means the **Run** page (or
`POST /api/runs`, see [api.md](api.md)) with the Reference Wallet. Body fields not shown use their defaults.

### G1: issuer as an object
1. Issuer Studio → new JSON-LD type, **Issuer field: object** (any one field).
2. Run it against **Inji Verify**: the verifier rejects with `ERR_INVALID_ISSUER` ("Invalid URI: issuer").
3. Run it against the **Reference Verifier**: accepted. Only the shape of `issuer` differs.

### G2: URL-hosted keys must be PEM
Serve an issuer key document at an `https://` URL with only `publicKeyMultibase` (or `publicKeyJwk`) and point
`proof.verificationMethod` at it: Verify cannot resolve the key. The playground's
`/pub/issuers/<slug>/keys/<alg>` always adds `publicKeyPem` for this reason.

### G3, G4, G5, G12, G18: the reference Compose files
Start Certify 0.14.0 and Verify 0.18.2 from the injistack Compose files and database scripts at those tags,
then:
- G3: issue a credential type with `revocable: true` → HTTP 500 (`column "capacity_in_kb" does not exist`).
- G4: answer any OpenID4VP request → HTTP 500 on `vp-submission/direct-post` (`response_code` missing).
- G5: `POST /v1/certify/pre-authorized-data` → "credentialOfferCache not available".
- G12: create an ES256 SD-JWT type → signing fails (no `CERTIFY_VC_SIGN_EC_R1` key policy).
- G18: `docker compose up -d --force-recreate certify` → Certify will not start (`KER-KMA-004 No such alias`).

Each fix is in the file named in the summary table, with a comment explaining it.

### G6: errors with HTTP 200
```bash
docker exec inji-playground-certify-1 curl -s -w ' HTTP %{http_code}\n' http://localhost:8090/v1/certify/actuator/health
# {"response":null,"errors":[{"errorCode":"unknown_error","errorMessage":"Full authentication is required…"}]} HTTP 200
```
A malformed `POST /v1/certify/pre-authorized-data` answers the same way: an `errors[]` body and status 200.

### G7, G16: canonicalization failures
Issue a JSON-LD credential while `www.w3.org` is slow or unreachable (or block it with a firewall rule): the
credential request fails with `ERROR_SIGNING_QR_DATA` / "Error occurred during canonicalization". It also happens
by itself now and then; run `run-ch3oqa` shows one at message 6 and the retry at message 7.

### G8: template injection
Write a Velocity template the way the samples do (`"fullName": "${fullName}"`) and issue with the claim value
`x", "degree": "PhD`: the credential gains a `degree` claim the issuer never configured. (The Studio's templates
escape every string, so this needs a hand-written configuration.)

### G9: mandatory SD-JWT claims
`POST /v1/certify/credential-configurations` with `sdJwtClaims.<claim>.mandatory: true` → rejected as an unknown
field; without it the pre-authorized validator cannot mark any claim mandatory.

### G10: SD-JWT validity and certificate
Issue the seeded **Karnataka Farmer Card (SD-JWT)** (Matrix M3) and decode it (Live traffic → Decoder):
- payload claims: `_sd, vct, district, iss, cnf, id, issuer_name`, with no `iat`, `exp` or `nbf`;
- header `x5c[0]` subject: `CN=www.example.com (CERTIFY_VC_SIGN_EC_R1-EC_SECP256R1_SIGN)`, issued by
  `CN=www.example.com (ROOT)`.

### G11, G19, G20: SD-JWT presentations
Run the SD-JWT Farmer Card against Inji Verify with tamper preset **Forge an SD-JWT with a self-signed x5c**
(G11), **Answer with a stale nonce** (G19) or **Drop the holder proof** (G20). Inji Verify reports `SUCCESS`
for all three; the Reference Verifier rejects them, and so does Inji Verify for the same tampers on JSON-LD.
The inspector shows the forged header (G11), the KB-JWT `nonce` that differs from the request's (G19) and the
SD-JWT ending in `~` with no KB-JWT (G20).

### G13: the Inji PE dialect
Verifier desk → choose a credential → switch between **Inji style** and **Spec style** for the same question. The
Inji filter is `{"type":"object","pattern":"KarnatakaFarmerCard"}` on `$.type`; a JSON Schema validator
applies `type: object` to an array and fails, so standard verifiers' filters and Inji's do not match each
other's credentials.

### G14: v1 verification has no reason
```bash
# a held JSON-LD credential with one claim changed
curl -s -X POST localhost:8080/pub/verify/v1/verify/vc-verification \
  -H 'content-type: application/vc+ld+json' --data @tampered.json
# {"verificationStatus":"INVALID"}
jq -n --rawfile c tampered.json '{verifiableCredential: $c}' | curl -s -X POST \
  localhost:8080/pub/verify/v1/verify/v2/vc-verification -H 'content-type: application/json' --data @- \
  | jq .schemaAndSignatureCheck
# {"valid":false,"error":{"errorCode":"ERR_INVALID_ISSUER","errorMessage":"Validation Error: Invalid URI: issuer"}}
```

### G15: missing suite context
Hand-write a VCDM 2.0 configuration whose `@context` lacks `https://w3id.org/security/suites/ed25519-2020/v1`
and sign with `Ed25519Signature2020`: Certify issues it; jsonld.js in safe mode (the Reference Verifier)
rejects the undefined `proof.type` term.

### G17: did:web with a port
Set `CERTIFY_DEFAULT_DID=did:web:playground.localhost%3A8080:pub:issuers:certify` in local mode and verify a
status-list credential: `Invalid URL host`. Local mode therefore uses URL keys; tunnel mode (port 443, no
`%3A`) uses did:web.

### G21: unresolvable status list
Issue a revocable credential, then make its `statusListCredential` URL unreachable (stop Certify, or rewrite
the host) and present it: Inji Verify answers `VP_VERIFICATION_FAILED` with "runtime exception" for the whole
presentation, rather than a failed status check on that credential.

### G22: DCQL to Verify 0.18.2
Run the Farmer Card against Inji Verify with **Query: DCQL** (Matrix M11). The inspector shows Verify's answer
to `POST /vp-request` with a `dcqlQuery`: HTTP 400
`{"errorCode":"BOTH_ID_AND_PD_CANNOT_BE_NULL","errorMessage":"Both Presentation Definition and Presentation Definition ID cannot be empty."}`.
The playground explains this as `QUERY_LANGUAGE_UNSUPPORTED`.

### G23: validFrom without milliseconds
Create a configuration whose template hard-codes `"validFrom": "2024-01-02T00:00:00Z"` → issuance returns HTTP
500 (`DateTimeParseException` in the ledger). `2024-01-02T00:00:00.000Z` works.

### G24: vct longer than 100 characters
Create an SD-JWT configuration in Certify whose `vct` is longer than 100 characters, for example the readable
`<base>/pub/issuers/agri-dept/types/KarnatakaFarmerCard` on a four-word `trycloudflare.com` host (101
characters), and issue it: `ERROR_SIGNING_QR_DATA`, with `value too long for type character varying(100)` in
Certify's log. The playground now switches to `<base>/pub/vct/<id>` when the readable form would be too long
(`vctFor` in [core/studio.ts](../packages/core/src/studio.ts)), so the bundle itself no longer hits it.

### G25: the SDK's by-value request
```bash
curl -s -X POST localhost:8080/pub/verify/v1/verify/vp-session-request -H 'content-type: application/json' \
  -d '{"clientId":"inji-playground","nonce":"MTc2","acceptVPWithoutHolderProof":false,
       "presentationDefinition":{"id":"farmer","input_descriptors":[{"id":"farmer","constraints":{"fields":[
       {"path":["$.type"],"filter":{"type":"object","pattern":"KarnatakaFarmerCard"}}]}}]}}' | jq 'keys'
# ["authorizationDetails","expiresAt","requestId","transactionId"]   <- no requestUri
```
With `"clientId": "did:web:<host>:pub:verify:v1:verify"` (Verify's own DID) the same call returns
`requestUri`, and `GET /vp-request/<id>` serves an EdDSA-signed `oauth-authz-req+jwt`. The SDK 0.18.1 uses
`request_uri` when it is present; otherwise it puts `presentation_definition` and `client_metadata` in the URL.
For the request above that is 1,191 characters, QR version 28 at the SDK's error correction level M (24 at
L), compared with 177 characters (version 9) by reference. Every real request has more fields and grows from
there. Runs and the Verifier desk therefore use Verify's DID as the client id by default ("Signed, by
reference"); choosing "Unsigned, by value" reproduces this form.

### G26: QR size
QR Lab (Capabilities page), or `POST /api/qr-lab/synthetic` with `photoKb`:

| Credential | Raw bytes | PixelPass chars | Smallest QR (level L) | Fits |
|---|---|---|---|---|
| JSON-LD Farmer Card, no photo (synthetic) | 555 | 444 | v11 | every limit |
| + 0.5 KB photo | 1,272 | 1,310 | v21 | every limit |
| + 1 KB photo | 1,956 | 2,088 | v27 | Inji Verify scan (v27), not Certify's Claim 169 cap (v23) |
| + 1.5 KB photo | 2,636 | 2,861 | v33 | QR maximum only (not Inji Verify scan or upload) |
| + 2.4 KB photo | 3,868 | 4,268 | v40 | QR maximum only |
| + 2.6 KB photo | 4,140 | 4,575 | none | nothing |
| Real JSON-LD Farmer Card from Certify | 989 | 839 | v16 | every limit |
| Real SD-JWT Farmer Card from Certify | 4,545 | 4,776 | none | nothing |

PixelPass (zlib + base45) shrinks plain JSON by ~20 %, but a photo or a JWT is already compact, so base45's
overhead wins and the payload grows 5–11 %. The SD-JWT's header alone is 3,312 characters, of which 2,328 are
the `x5c` chain. Because Inji Verify does not anchor `x5c` in a trust list (G11), that chain costs most of the
size and adds no trust. The matrix's "direct share" rows (M4, M5) submit the PixelPass payload directly, so
they test verification, not camera scanning.

### G27: claims in the access token
Run any issuance and open the **Token request** message with **Reveal tokens** (this computer only), then
decode the access token. Run `run-hkvnrw`, for example, has:
```json
{"sub":"{\"fullName\":\"Ramesh Kumar\",\"farmerId\":\"KA-MND-20931\",\"primaryCropType\":\"Ragi\",\"landAreaAcres\":3.5,\"district\":\"Mandya\"}",
 "aud":".../issuance/credential","c_nonce":"…","scope":"agri-dept__karnatakafarmercard","client_id":"", …}
```
The playground seals recorded tokens and masks them in the inspector, but any ordinary reverse proxy or log
pipeline in front of Certify would keep them in plaintext.

### G28: concurrent issuance
Start three runs of the same JSON-LD type at the same moment (`POST /api/runs` ×3 in parallel). On 11 Oct 2026,
two of three failed with `invalid_proof` when the claims were identical (`run-c7mbyq`, `run-izg6ca`;
`run-hkvnrw` succeeded) and one of three with distinct claims (`run-jg3rbg`). In every failed run the proof
JWT's `nonce` equals its own token response's `c_nonce`, the holder keys differ and `aud`/`iat` are correct, so
the wallet side is right. Sequential issuance (the matrix) never fails. Not yet narrowed down to a cause
inside Certify (a shared nonce cache entry is the likely candidate); confirm with maintainers before filing.

### G29: uploads under 10 KB
On the Verifier desk, choose **Upload a QR code image** and pick `valid-vc-dm-1.1.png` or `expired-vc.png` from
Inji Verify's documentation samples (3.4 KB and 4.4 KB). The SDK answers "File size not supported. The file
size should be between 10 KB and 5 MB" and never calls the service. The same images scaled up past 10 KB
(`ffmpeg -i in.png -vf scale=iw*2:ih*2:flags=neighbor out.png`) verify as SUCCESS and EXPIRED. Checked on
12 Oct 2026; the larger samples (`valid-vc-dm-2.0.png`, `invalid-vc.png`) upload normally.

### G30: walt.id's wallet cannot read Certify's metadata
With the external lab running, start a run with wallet *walt.id Wallet (API)* and any Studio type (Matrix X11,
X12). Its "Accept the offer" step answers HTTP 400 `Element class kotlinx.serialization.json.JsonArray is not a
JsonObject`; the inspector shows walt.id fetching the offer and Certify's metadata through the gateway, then
stopping. The stack trace runs through `ClaimDescriptorNamespacedMapSerializer` inside `CredentialSupported`.
Removing the one SD-JWT configuration from Certify (`DELETE /v1/certify/credential-configurations/agri-dept__KarnatakaFarmerCard__sdjwt`,
restored with `POST /api/studio/reconcile`) lets walt.id get past the metadata. Certify's shape follows
OpenID4VCI draft 13 (Appendix A.3.2), so the fix belongs in walt.id.

### G32: `cnf.kid` versus `cnf.jwk`
Matrix X10: the Reference Wallet collects the SD-JWT Farmer Card from Certify and presents it to the walt.id
verifier. walt.id answers `signature_sd-jwt-vc: java.lang.NullPointerException … JWK.parse`. Decoding the
credential shows `"cnf": {"kid": "did:jwk:…#0"}`; walt.id's own credentials (X6, accepted) use `"cnf": {"jwk": {…}}`.

### G33: descriptor ids
Matrix X9: the walt.id wallet answers the Reference Verifier with `descriptor_map[0].id` =
`waltid-demo-librarycard-vc-sd-jwt` (the definition id). The request's only input descriptor is
`waltid-demo-librarycard-vc-sd-jwt-credential`. The Reference Verifier's check "Every requested credential
answered" names both. X7 (the same wallet, Inji Verify) is accepted.

### G35: `request_uri` and the Accept header
Matrix X18: walt.id's wallet resolves an Inji Verify request whose `client_id` is Verify's DID. Its fetch of
the `request_uri` (recorded in the inspector as *Fetch request object*, actor "walt.id WebDataFetcher") sends
`Accept: application/json,application/json` and gets `406 Not Acceptable`; the wallet then fails with
"AuthorizationRequest cannot be retrieved". The same request with `Accept: application/oauth-authz-req+jwt` or
`*/*` returns the JWT:
```bash
RU=$(curl -s -X POST localhost:8080/pub/verify/v1/verify/vp-request -H 'content-type: application/json' \
  -d '{"clientId":"did:web:playground.localhost%3A8080:pub:verify:v1:verify","nonce":"abcdefgh1",
       "presentationDefinition":{"id":"t","input_descriptors":[{"id":"c","constraints":{"fields":[{"path":["$.vct"]}]}}]}}' | jq -r .requestUri)
curl -s -o /dev/null -w '%{http_code}\n' -H 'accept: application/json' "$RU"                 # 406
curl -s -o /dev/null -w '%{http_code}\n' -H 'accept: application/oauth-authz-req+jwt' "$RU"  # 200
```
RFC 9101 makes the request object a JWT, so the wallet should accept that media type; Inji Verify could also
serve it for any `Accept`, as most authorization servers do. X7 (the by-value form) is accepted.

### G36: DCQL claim paths in Inji Verify 1.0
Run Collab's *Mock Verifiable Credential (VCDM 1.1)* with the Reference Wallet against *Inji Verify 1.0 (MOSIP
Collab)*, query DCQL, asking for one claim (Matrix C3 and C4):
- *DCQL claim paths: From the credential* (`["credentialSubject","email"]`, as OpenID4VP 1.0 B.1.2 and its
  examples write them): Verify answers the submission with HTTP 400 `invalid_request` "vp_token ldp_vc credential
  does not contain a required claim path declared in the DCQL query. Path: [credentialSubject, email]".
- *From credentialSubject* (`["email"]`, as Inji's "Transition from PEX to DCQL" guide maps
  `$.credentialSubject.x`): accepted.
`["credentialSubject"]` and `["type"]` are refused the same way, so paths are read from inside credentialSubject
only. The playground's Query Builder and Verifier desk show both forms side by side.

### G37: Mimoto's stale metadata URLs
```bash
curl -s https://api.collab.mosip.net/v1/mimoto/issuers | jq -r '.response.issuers[] | [.issuer_id, .wellknown_endpoint] | @tsv'
curl -s -o /dev/null -w '%{http_code}\n' https://injicertify-landregistry.collab.mosip.net/v1/certify/issuance/.well-known/openid-credential-issuer   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://injicertify-landregistry.collab.mosip.net/.well-known/openid-credential-issuer                     # 200
```
The playground falls back to the OpenID4VCI location and notes it on the Parties page.

### G38: issuer and signing key of Collab's mock credentials
Collect *Mock Verifiable Credential* from Collab (Wallet → Collect from MOSIP Collab) and open it: `issuer` is
`did:web:injicertify-mock.collab.mosip.net`, `proof.verificationMethod` is
`did:web:inji.github.io:inji-config:collab:mock-identity#sLECdoF…`. That DID document
(`https://inji.github.io/inji-config/collab/mock-identity/did.json`) lists the key with itself as controller, and the
issuer's own DID document lists the same key under the issuer DID. The proof therefore points at a key the
named issuer does not control.

### G39: `EdDSA` versus `Ed25519`
Collect *Commercial Truck Pass* from Collab's TruckPass issuer with a wallet that signs its proof with
`alg: EdDSA`: HTTP 400 `invalid_proof` "Error encountered during proof jwt parsing". Its metadata lists
`proof_signing_alg_values_supported: [RS256, PS256, ES256, ES256K, Ed25519]`. With `alg: Ed25519` the proof passes
(the Reference Wallet now picks a name the issuer lists). Collab's 1.0 issuers list `EdDSA`.

### G40: demo UINs without records
Collect from each auto-sign-in issuer with each published UIN (Wallet → Collect from MOSIP Collab → Demo
identity). On 23 Oct 2026: the mock and Farmer issuers know all of them; Land registry only 2154189532 and
5614273165; the mDL issuer only 2154189532; TruckPass none.

### G41: the Land registry's signing key is not in its DID document
Collect *Statement of the Status of Information Declared in CAR (VC DM2.0)* from Collab's Land registry (Wallet →
Collect from MOSIP Collab) and present it to *Inji Verify 1.0 (MOSIP Collab)* (Matrix C7): the result call answers
HTTP 500 `VP_VERIFICATION_FAILED … PublicKeyResolutionFailedException: Public key extraction failed for kid:
did:web:inji.github.io:inji-config:collab:landregistry#0B6e9kc5PoTRd_L9FrmkVRCQG0pQbL9a3fRbrO9hddo`.
```bash
curl -s https://inji.github.io/inji-config/collab/landregistry/did.json | jq -r '.verificationMethod[].id'
# did:web:inji.github.io:inji-config:collab:landregistry#2Fx_l12c8_2xKT-I2QL1dF4UIncSNwyuAx11PxLDtdc   (no #0B6e9kc5…)
```
The mock and Farmer issuers' keys resolve (C2, C6). The MOSIP ID, insurance and mDL issuers publish no DID document at the same place (404); their credentials were not verified here.

## MOSIP Collab (Inji 1.0.0-alpha.1)

The C rows of the matrix run against MOSIP's hosted sandbox, with the playground on this machine. What works,
with nothing changed on Collab:

- **Authorization code issuance** from Collab's Inji Certify (1.0 line: PKCE, `private_key_jwt`, the nonce
  endpoint, `credential_configuration_id` and `proofs`), the Reference Wallet signing in at Collab's eSignet with a
  published demo UIN and the static OTP (C1–C8). The mDL issuer issues an **mso_mdoc** this way too.
- **Inji Verify 1.0** verifies them over OpenID4VP 1.0 with DCQL (C1, C2, C4–C6) and by direct share (C8), and
  refuses Presentation Exchange (C9, the mirror of M11).
- **Across the version split** (checked 23 Oct 2026, all accepted): Collab's 1.0 credentials, W3C and SD-JWT, at
  the bundled Inji Verify 0.18.2 (C10, C11), and the bundled Certify 0.14 SD-JWT at Collab's Inji Verify 1.0
  (C12). C13 (a bundled W3C credential at Collab's Verify) needs a public URL, because Collab's Verify must fetch
  the local issuer's did:web, and runs only in tunnel mode.
- **What does not work:** the Land registry's credentials cannot be verified by anyone (G41, C7).
- **Security:** Verify 1.0 rejects a stale nonce, a missing KB-JWT, an altered claim and someone else's
  credential (C16, C17, C19–C21), so G19 and G20 are fixed; it still accepts the forged SD-JWT of G11 (C18).

## External parties

The X rows of the matrix put Inji next to an independent stack. What works, all without code written for
walt.id (the parties file describes every call):

- A credential from **an issuer that is not Inji** (walt.id, SD-JWT VC signed with its own key and `x5c`) is
  collected by the Reference Wallet and **verified by Inji Verify**, over OpenID4VP (X1, X3) and by direct share
  (X2); tampering is still caught (X13). This is the case the mentors described at AMA 2.
- **A wallet that is not Inji** (walt.id's wallet API) presents to Inji Verify (X7) and to walt.id's verifier (X8).
- The Reference Wallet presents to **a verifier that is not Inji** (X6), which catches a stale nonce and an
  altered claim (X16, X17).
- The Reference Verifier trusts the external issuer only through the certificate listed in the parties file,
  so the forged-signature preset is rejected there (X15) and accepted by Inji Verify (X14 = G11 again).

What does not work yet is G30 (walt.id cannot collect from Certify), G32 (walt.id cannot verify Certify's
SD-JWTs), G33 (walt.id's submission ids) and G35 (walt.id cannot fetch Inji Verify's signed requests). G31
and G34 have workarounds.

## Tamper matrix (Reference Wallet, OpenID4VP cross-device, Presentation Exchange)

Expected for every tamper preset: the verifier **rejects**. ✅ = rejected (correct), ❌ = accepted.

| Tamper preset | Inji Verify · ldp_vc | Inji Verify · SD-JWT | Reference Verifier · ldp_vc | Reference Verifier · SD-JWT |
|---|---|---|---|---|
| Alter a claim | ✅ `ERR_SIGNATURE_VERIFICATION_FAILED` | ✅ `ERR_INVALID_DISCLOSURE` | ✅ invalid signature | ✅ disclosure digest mismatch |
| Stale nonce | ✅ nonce validation failed | ❌ **accepted** (G19) | ✅ | ✅ |
| Drop holder proof | ✅ client id / nonce validation failed | ❌ **accepted** (G20) | ✅ | ✅ |
| Someone else's credential | ✅ `ERR_HOLDER_BINDING_CHECK_FAILED` | ✅ `ERR_INVALID_KB_SIGNATURE` | ✅ | ✅ |
| Forged SD-JWT, self-signed x5c | n/a | ❌ **accepted** (G11) | n/a | ✅ not anchored in trusted issuer keys |

With the walt.id issuer's Library Card (SD-JWT): Inji Verify rejects an altered claim (X13) and accepts the
forged signature (X14, G11); the Reference Verifier rejects the forgery (X15); walt.id's verifier rejects a
stale nonce (X16) and an altered claim (X17).

## Which to file first

MOSIP said at AMA 4 that a list of gaps per issuer, with test reports, is enough; filing issues is optional.
If issues are filed, suggested, in order:
1. **G36** (inji-verify): Verify 1.0 and Inji's own migration guide read DCQL claim paths differently from
   OpenID4VP 1.0, so spec-written requests reject honest presentations. It affects the release line MOSIP is
   moving to, and the C3/C4 pair reproduces it in one click each.
2. **G4** (inji-verify): the 0.18.2 Compose database script breaks every OpenID4VP submission. It is easy to
   confirm and blocks anyone trying the release.
3. **G24** (inji-certify): the `vct` column length breaks SD-JWT issuance for spec-recommended URL `vct`s.
4. **G1** (inji-verify): the `issuer` object form is rejected, with a two-run reproduction.

G3, G5 and G18 can go together as one "injistack Compose at 0.14.0" issue. Link each issue here once it is
filed.

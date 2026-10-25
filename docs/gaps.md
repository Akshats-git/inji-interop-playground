# Interoperability gaps found with the playground

These are real problems the playground found in three situations:

- while wiring released Inji modules together;
- while connecting them to parties that are not Inji (G29 to G35). These are the walt.id issuer, verifier and
  wallet declared in [infra/parties.yaml](../infra/parties.yaml);
- while connecting to **MOSIP Collab** (G36 to G41). Collab is MOSIP's hosted sandbox, and it runs the Inji
  **1.0.0-alpha.1** line.

Each gap names the issuer, wallet and verifier it was found against. It also gives the evidence, a way to
reproduce it and the workaround the playground uses.

Versions:
- **bundled:** Inji Certify 0.14.0 and Inji Verify 0.18.2 (released images, unmodified). The Verify React SDK is
  0.18.1 and vc-verifier is 1.8.1 (inside Verify).
- **MOSIP Collab, checked 23 Oct 2026:** Inji Verify 1.0.0-alpha.1 at `injiverify.collab.mosip.net`. Inji Certify
  issuers of the 1.0 line (`injicertify-mock`, `-farmer`, `-landregistry`, `-mdl`, `-mosipid`, `-insurance`) and
  of the 0.x line (`-truckpass`, `-globalid`, `-tan`). eSignet at `esignet-mock.collab.mosip.net`. Mimoto at
  `api.collab.mosip.net`.

**Severity:** **High** means it breaks a mainstream flow or weakens a security property. **Medium** means it
breaks a variant that the standards allow. **Low** means misleading behaviour or a papercut.

**Evidence:**
- **Matrix Mx/Tx/Xx/Cx** is a row of the automated matrix ([interop-report.md](interop-report.md)). The matrix is
  regenerated on every run. C rows use MOSIP Collab. The Reference Wallet signs in at Collab's eSignet with a
  published demo UIN and the static test OTP.
- **Run `run-…`** is a playground run that you can open at `/runs/<id>`. Runs are purged after `RETENTION_DAYS`.
- **Probe** is a direct HTTP call, given in the reproduction steps.
- **Workaround** means the playground ships a fix in its configuration or code. If you remove the fix, the
  failure comes back. I reproduced these while building Phases 1 to 4.

**Report** says where each gap should go. It is either a **private** report to the MOSIP maintainers (security or
privacy), a **public issue** on the named repository, or **docs** (an update to the deployment docs or Compose
files).

## Summary

| # | Component | Gap | Severity | Evidence | Report |
|---|---|---|---|---|---|
| G1 | Inji Verify / vc-verifier | A W3C-valid `issuer` **object** (`{"id": …, "name": …}`) is rejected with `ERR_INVALID_ISSUER`. | Medium | Run `run-x5rtnq` (rejected) versus `run-pfofcw` (the Reference Verifier accepts the same credential) | Public issue (inji-verify) |
| G2 | vc-verifier | The HTTP(S) key resolver reads `publicKeyPem` whatever the key format. So URL-hosted `publicKeyMultibase` and `publicKeyJwk` keys never resolve. | Medium | Workaround: [studio/service.ts](../apps/bff/src/studio/service.ts) publishes `publicKeyPem`. | Public issue (vc-verifier) |
| G3 | Certify (injistack Compose) | `certify_init.sql` at v0.14.0 has the pre-0.13 schema (`capacity` instead of `capacity_in_kb`). Every **revocable** credential fails with HTTP 500. | High | Workaround: [01-certify.sql](../infra/postgres/init/01-certify.sql) | Public issue (inji-certify) |
| G4 | Inji Verify (Compose) | `db-init/init.sql` at v0.18.2 lacks `vp_submission.response_code*`. **Every OpenID4VP submission** fails with HTTP 500. | High | Workaround: [02-verify.sql](../infra/postgres/init/02-verify.sql) | Public issue (inji-verify) |
| G5 | Certify (injistack Compose) | The default cache list lacks `credentialOfferCache`. `/pre-authorized-data` fails ("credentialOfferCache not available"), so the pre-authorized flow does not work out of the box. | High | Workaround: [certify-playground.properties](../infra/certify/certify-playground.properties) | Public issue (inji-certify) |
| G6 | Certify | Errors come back as HTTP **200** with an `errors[]` envelope (`/pre-authorized-data`, `/actuator/health`). Health checks and clients that trust status codes are misled. | Low | Probe (below). Workaround: the Compose health check reads issuer metadata. | Public issue (inji-certify) |
| G7 | Certify | Any `CertifyException` during issuance is re-labelled `ERROR_SIGNING_QR_DATA`. One example is a JSON-LD context that fails to load. | Low | Run `run-ch3oqa` message 6: `ERROR_SIGNING_QR_DATA` / "Error occurred during canonicalization" | Public issue (inji-certify) |
| G8 | Certify | Reported privately to MOSIP. Details withheld until they have had time to respond. | Medium (security) | Withheld | **Private** |
| G9 | Certify | `sdJwtClaims` rejects `mandatory`, yet the pre-authorized validator reads `mandatory` from it. So you can't configure mandatory SD-JWT claims through the API. | Low | Probe (Phase 1). The Studio omits `mandatory`. | Public issue (inji-certify) |
| G10 | Certify | SD-JWT VCs carry no `iat`, `exp` or `nbf`, so no expiry can be enforced. They are signed with the default self-signed `www.example.com (ROOT)` certificate in `x5c`. **Collab's Certify 1.0 does the same** (`injicertify-mock`). | Medium | Probe of the Matrix M3 credential (below). Matrix C14 (Collab's SD-JWT has no `exp`). | Public issue (inji-certify) |
| G11 | Inji Verify (0.18.2 and 1.0.0-alpha.1) | Reported privately to MOSIP. Details withheld until they have had time to respond. | **High (security)** | Withheld | **Private** |
| G12 | db_scripts | `certify-key_policy_def.csv` lacks `CERTIFY_VC_SIGN_EC_R1`. So ES256 signing fails on a database built from the release scripts. The DDL also relies on a fresh session's `search_path`. | Low | Workaround: [01-certify.sql](../infra/postgres/init/01-certify.sql), [certify-default.properties](../infra/certify/certify-default.properties) | Public issue (inji-certify) |
| G13 | Inji PE dialect | Inji's presentation definitions filter `$.type` with `{"type":"object","pattern":…}`. That is not valid JSON Schema for an array. Spec-style `contains/const` filters may not match in Inji wallets. | Medium | The Verifier desk shows both dialects. See `PeDialect` in [core/query.ts](../packages/core/src/query.ts). | Public issue (inji-verify) |
| G14 | Inji Verify | `/vc-verification` (v1) only answers `INVALID`, with no reason. The reason is only available from `/v2/vc-verification`. | Low | Probe (below) | Public issue (inji-verify) |
| G15 | Certify | A credential signed with `Ed25519Signature2020` is issued without that suite's `@context`. Lenient JSON-LD processing drops the undefined proof terms, but strict processors cannot check the credential. **Every Collab ldp_vc issuer does this** (Certify 1.0 line, VCDM 1.1 and 2.0). So a strict wallet cannot even sign a presentation of it. | Medium | Workaround: the Studio adds the suite context to every template. Matrix C15 (the strict Reference Verifier rejects a Collab credential). | Public issue (inji-certify) |
| G16 | Certify | Certify fetches standard JSON-LD contexts (`https://www.w3.org/ns/credentials/v2` and others) from the internet at **every signature**. A transient network error fails issuance (`Error occurred during canonicalization`). The 1.0 line adds a context loader. **Inji Verify 0.18.2 does the same.** On 24 Oct, one verification of a fresh Studio credential failed with `LOADING_REMOTE_CONTEXT_FAILED` (reported as `VP_VERIFICATION_FAILED`, "runtime exception"). Three reruns of the same credential were accepted. | Medium | Run `run-ch3oqa` message 6 (failed, retried at message 7). The Reference Wallet and the matrix retry once. | Public issue (inji-certify) |
| G17 | vc-verifier | `did:web` identifiers with a port (`did:web:host%3A8080:…`, as the did:web spec requires) fail with `Invalid URL host`, because `%3A` is not decoded. | Low | Workaround: URL keys in local mode ([compose.yml](../infra/compose.yml)) | Public issue (vc-verifier) |
| G18 | Certify (injistack Compose) | The keystore volume is mounted at `/home/mosip/CERTIFY_PKCS12`, but the image runs from `/home/inji`. So the keys are **not persisted**. After a container re-create, Certify refuses to start (`KER-KMA-004 No such alias`) until the database is wiped. | High | Workaround: [compose.yml](../infra/compose.yml) mounts `/home/inji/CERTIFY_PKCS12`. | Public issue (inji-certify) |
| G19 | Inji Verify 0.18.2 | Reported privately to MOSIP. Details withheld until they have had time to respond. | **High (security)** | Withheld | **Private** |
| G20 | Inji Verify 0.18.2 | Reported privately to MOSIP. Details withheld until they have had time to respond. | **High (security)** | Withheld | **Private** |
| G21 | Inji Verify | When a credential's status list can't be resolved, the whole presentation fails with an opaque `VP_VERIFICATION_FAILED` ("runtime exception"). It should give a status-check error instead. | Low | Observed in Phase 2 (below) | Public issue (inji-verify) |
| G22 | Inji Verify | A DCQL request (`dcqlQuery`, the 1.0 shape) sent to 0.18.2 fails with `BOTH_ID_AND_PD_CANNOT_BE_NULL`, not a clear "query language not supported". Integrators who mix versions get a misleading error. In the other direction, 1.0.0-alpha.1 answers a Presentation Exchange request with `UNKNOWN_FIELD`. | Low | Matrix M11 (0.18.2) and C9 (Collab, 1.0.0-alpha.1) | Public issue (inji-verify) |
| G23 | Certify | A template `validFrom` that is valid RFC 3339 but has no milliseconds (`2024-01-02T00:00:00Z`) makes issuance fail with HTTP 500 (`DateTimeParseException` in the ledger). So issuers can't set their own validity dates freely. | Low | Workaround: [core/studio.ts](../packages/core/src/studio.ts) keeps milliseconds. | Public issue (inji-certify) |
| G24 | Certify | Certify writes each issued credential's type to `certify.ledger.credential_type`, a `varchar(100)`. For SD-JWT that is the `vct`. A URL `vct` on a longer host (101 characters on a quick tunnel) makes every issuance fail with `ERROR_SIGNING_QR_DATA` after a `value too long` SQL error. | Medium | Matrix over a tunnel (Phase 4). Workaround: a short `/pub/vct/<id>`. | Public issue (inji-certify) |
| G25 | Inji Verify and Verify SDK | Verify only returns a `requestUri` (a signed request object) when `clientId` is its own DID. With any other client id, it returns the request by value. For a one-field request, the SDK then builds a 1,191-character `openid4vp://` URL (QR version 28 at the SDK's level M). That request is unsigned, and it is denser than Inji Verify's own camera limit (v27). | Medium | Probe (below) | Public issue (inji-verify) |
| G26 | Certify (SD-JWT) and QR | A 5-claim SD-JWT VC from Certify is 4,545 characters. 73 % of that is the two-certificate `x5c` chain in the header, so it **fits no QR code** (PixelPass makes it 5 % larger). A JSON-LD credential with a 1 KB photo already needs QR v27 (Inji Verify's camera limit). Above about 2.4 KB, nothing fits. | Medium | QR Lab probes (below) | Public issue (inji-certify) |
| G27 | Certify | Reported privately to MOSIP. Details withheld until they have had time to respond. | Medium (privacy) | Withheld | **Private** |
| G28 | Certify | Concurrent pre-authorized issuances sometimes fail with `invalid_proof`. Each proof JWT carries the `c_nonce` from its own token response and uses its own holder key. | Low | Runs `run-c7mbyq` and `run-izg6ca` (failed) next to `run-hkvnrw`. `run-jg3rbg` (below). | Public issue (inji-certify), after confirming |
| G29 | Inji Verify React SDK | `QRCodeVerification` refuses uploaded images under **10 KB** ("File size not supported. The file size should be between 10 KB and 5 MB"). A plain QR PNG is usually smaller. Two of the four sample QR codes in Inji Verify's own docs (3.4 KB and 4.4 KB) can't be uploaded. | Low | Probe on the Verifier desk (below) | Public issue (inji-verify) |
| G30 | walt.id wallet-api 1.0 and Certify | walt.id's wallet reads every credential configuration's `claims` as an mdoc-style namespace map. Certify's SD-JWT configurations use the draft-13 shape (`{"fullName": {"display": […]}}`). So parsing the **whole** metadata fails. The wallet can then collect **no** Certify credential, JSON-LD ones included, while Certify advertises any SD-JWT type. | Medium | Matrix X11, X12 (below) | Public issue (walt-id/waltid-identity) |
| G31 | walt.id verifier-api 1.0 | The verifier refuses a key-binding JWT without a `kid` header ("No key ID found in JWT header"). The holder key is the one in `cnf`, and SD-JWT does not require `kid`. | Low | Workaround: the Reference Wallet sets `kid` ([presentation.ts](../apps/bff/src/reference/wallet/presentation.ts)). | Public issue (walt-id/waltid-identity) |
| G32 | Certify and walt.id verifier-api 1.0 | Certify binds SD-JWTs to the holder with `cnf: {"kid": "did:jwk:…"}`. walt.id's verifier only reads `cnf.jwk` and fails with a `NullPointerException`. So **no Certify SD-JWT verifies at walt.id**. RFC 7800 allows both forms. The SD-JWT VC drafts show `cnf.jwk`. | Medium | Matrix X10 | Public issue (walt.id). Note to inji-certify. |
| G33 | walt.id wallet-api 1.0 (and Inji Verify's leniency) | walt.id's wallet sets `presentation_submission.descriptor_map[].id` to the presentation **definition** id. Presentation Exchange requires the **input descriptor** id. Inji Verify 0.18.2 accepts it without checking. The Reference Verifier rejects it. | Low | Matrix X9 (rejected) versus X7 (Inji Verify accepts) | Public issue (walt.id). Mention to inji-verify. |
| G34 | walt.id wallet-api 1.0 | `matchCredentialsForPresentationRequest` returns `[]` for an Inji Verify request that the same wallet resolves without trouble. Matching on the resolved `presentation_definition` finds the credential. | Low | Workaround: two steps in [parties.yaml](../infra/parties.yaml) | Public issue (walt-id/waltid-identity) |
| G35 | walt.id wallet-api 1.0 and Inji Verify | walt.id's wallet fetches a `request_uri` with `Accept: application/json` only. Inji Verify only serves the signed request object as `application/oauth-authz-req+jwt` and answers **406 Not Acceptable**. So walt.id's wallet can't answer any **signed** Inji Verify request. It can answer the unsigned by-value form (X7). | Medium | Matrix X18 (fails), X7 (by value, accepted) | Public issue (walt.id). Note to inji-verify: serve the JWT for `*/*`-style or JSON accepts too. |
| G36 | Inji Verify 1.0 (and Inji's PEX-to-DCQL guide) | For W3C credentials, Verify 1.0 evaluates DCQL claim paths from `credentialSubject` (`["email"]`). OpenID4VP 1.0 (Appendix B.1.2) evaluates them from the credential's root (`["credentialSubject","email"]`). A query written to the spec, from any relying party, makes Verify reject every honest presentation ("does not contain a required claim path"). Inji-style queries will not match in wallets that follow the spec. | **High (interop)** | Matrix C3 (spec paths: rejected) versus C4 (Inji paths: accepted). Probe below. | Public issue (inji-verify) and docs |
| G37 | Mimoto config on Collab | Collab's Mimoto lists four issuers (Land, Mosip, StayProtected, MockMdl) with a `wellknown_endpoint` on the 0.x path `/v1/certify/issuance/.well-known/…`. That path answers 404, because those issuers moved to the 1.0 line. The OpenID4VCI location works. The mock issuer named in the PS2 brief is not listed. That is deliberate. MOSIP's answer on 28 Sep (community.mosip.io topic 2903) is that the mock instance is for trying things locally with your own Mimoto. | Low | Parties page notes. Probe below. | Docs / inji-config (collab) |
| G38 | Certify on Collab (mock issuer) | The credentials name `did:web:injicertify-mock.collab.mosip.net` as `issuer`. But they are signed by `did:web:inji.github.io:inji-config:collab:mock-identity#…`, a key whose controller is a different DID. A verifier that checks the signing key belongs to the issuer (as Data Integrity requires) must reject them. Inji Verify does not check. | Medium | Probe below (decoded credential and both DID documents) | Public issue (inji-certify) / Collab config |
| G39 | Certify 0.x on Collab | TruckPass (and the other 0.x instances) advertise `Ed25519` as the only Ed25519 proof algorithm. They refuse a proof JWT signed with `alg: EdDSA` ("Error encountered during proof jwt parsing"). `EdDSA` (RFC 8037) is what most wallets send, and it is what Collab's 1.0 issuers advertise. `Ed25519` is the newer RFC 9864 name. | Low | Probe below. Workaround: the Reference Wallet picks an advertised name. | Public issue (inji-certify) |
| G40 | Collab test data | The demo UINs that MOSIP publishes for Collab do not all have records at its issuers. TruckPass has none (`ERROR_FETCHING_DATA_RECORD_FROM_TABLE`). Land registry only has 2154189532 and 5614273165. The mDL issuer only has 2154189532 (`ERROR_FETCHING_IDENTITY_DATA` for the rest). | Low | Checked 23 Oct 2026. The parties file's test data says which UIN works where. | Docs |
| G41 | Collab Land registry (Certify 1.0) and Inji Verify 1.0 | Credentials from `injicertify-landregistry` are signed with key `did:web:inji.github.io:inji-config:collab:landregistry#0B6e9kc5…`. But that DID document lists only `#2Fx_l12c…`. Inji Verify 1.0 answers `PublicKeyResolutionFailedException` (HTTP 500 `VP_VERIFICATION_FAILED`). So **no verifier can check a Collab Land credential**. | Medium | Matrix C7. Probe below. | Collab config (inji-config) / public issue (inji-certify) |

I found G36 to G41, and the Collab notes on G10, G11, G15, G19, G20 and G22, on 23 Oct 2026. I ran the
playground locally and connected it to MOSIP Collab (Inji 1.0.0-alpha.1).

I produced or re-checked every Matrix and Run reference above on 11 Oct 2026 with the local bundle. The matrix
run that day had 28 of 31 rows as expected, 3 known gaps (T6 is G19, T10 is G20, T17 is G11) and 0 unexpected.

Since then, the matrix has grown:
- On 12 Oct 2026 it gained 17 rows with external parties (`./playground.sh up --external`). That made 40 of 48
  rows as expected, 8 known gaps (T6, T10, T17, and X9 is G33, X10 is G32, X11 and X12 are G30, X14 is G11) and
  0 unexpected.
- On 19 Oct 2026 runs switched to Inji Verify's **signed** requests by default (its did:web as `client_id`, and
  the request fetched by `request_uri`). M14, M15 and X7 keep the by-value form. The matrix then had 51 rows:
  42 as expected, 9 known gaps (the eight above plus X18, which is G35) and 0 unexpected.
- On 23 Oct 2026 I added MOSIP Collab (20 C rows). That made 71 rows, 58 as expected, 13 known gaps (the nine
  above plus C3 is G36, C7 is G41, C15 is G15 and C18 is G11) and 0 unexpected.
- On 24 Oct 2026 I added Animo's hosted playground (4 A rows) and rebuilt the images. That made 75 rows, 62 as
  expected, the same 13 known gaps and 0 unexpected.

## Responsible disclosure

**G8, G11, G19, G20 and G27** are security or privacy weaknesses in released MOSIP software. I have reported them
to the MOSIP team privately, or I am in the process of doing so. So this file lists them without the mechanism
or the steps to reproduce. The matrix still records which rows are affected. I will add the details here once
MOSIP has had time to respond.

## How to reproduce

All steps assume `./playground.sh up` and the seeded demo content. "Run" means the **Run** page (or
`POST /api/runs`, see [api.md](api.md)) with the Reference Wallet. Body fields that are not shown use their
defaults.

### G1: issuer as an object
1. In Issuer Studio, create a new JSON-LD type with **Issuer field: object** (any one field).
2. Run it against **Inji Verify**. The verifier rejects it with `ERR_INVALID_ISSUER` ("Invalid URI: issuer").
3. Run it against the **Reference Verifier**. It accepts the credential. Only the shape of `issuer` differs.

### G2: URL-hosted keys must be PEM
Serve an issuer key document at an `https://` URL with only `publicKeyMultibase` (or `publicKeyJwk`). Point
`proof.verificationMethod` at it. Verify cannot resolve the key. The playground's
`/pub/issuers/<slug>/keys/<alg>` always adds `publicKeyPem` for this reason.

### G3, G4, G5, G12, G18: the reference Compose files
Start Certify 0.14.0 and Verify 0.18.2 from the injistack Compose files and database scripts at those tags.
Then try each of these:
- G3: issue a credential type with `revocable: true`. You get HTTP 500 (`column "capacity_in_kb" does not exist`).
- G4: answer any OpenID4VP request. You get HTTP 500 on `vp-submission/direct-post` (`response_code` missing).
- G5: `POST /v1/certify/pre-authorized-data` gives "credentialOfferCache not available".
- G12: create an ES256 SD-JWT type. Signing fails (no `CERTIFY_VC_SIGN_EC_R1` key policy).
- G18: `docker compose up -d --force-recreate certify`. Certify will not start (`KER-KMA-004 No such alias`).

Each fix is in the file named in the summary table, with a comment that explains it.

### G6: errors with HTTP 200
```bash
docker exec inji-playground-certify-1 curl -s -w ' HTTP %{http_code}\n' http://localhost:8090/v1/certify/actuator/health
# {"response":null,"errors":[{"errorCode":"unknown_error","errorMessage":"Full authentication is required…"}]} HTTP 200
```
A malformed `POST /v1/certify/pre-authorized-data` answers the same way: an `errors[]` body and status 200.

### G7, G16: canonicalization failures
Issue a JSON-LD credential while `www.w3.org` is slow or unreachable (or block it with a firewall rule). The
credential request fails with `ERROR_SIGNING_QR_DATA` / "Error occurred during canonicalization". It also
happens by itself now and then. Run `run-ch3oqa` shows one at message 6 and the retry at message 7.

### G8: reported privately
Details withheld until MOSIP has had time to respond.

### G9: mandatory SD-JWT claims
`POST /v1/certify/credential-configurations` with `sdJwtClaims.<claim>.mandatory: true` is rejected as an unknown
field. Without it, the pre-authorized validator cannot mark any claim mandatory.

### G10: SD-JWT validity and certificate
Issue the seeded **Karnataka Farmer Card (SD-JWT)** (Matrix M3) and decode it (Live traffic, then Decoder):
- The payload claims are `_sd, vct, district, iss, cnf, id, issuer_name`. There is no `iat`, `exp` or `nbf`.
- The subject of header `x5c[0]` is `CN=www.example.com (CERTIFY_VC_SIGN_EC_R1-EC_SECP256R1_SIGN)`. It is issued by
  `CN=www.example.com (ROOT)`.

### G11, G19, G20: reported privately
Details withheld until MOSIP has had time to respond.

### G13: the Inji PE dialect
In the Verifier desk, choose a credential. Switch between **Inji style** and **Spec style** for the same
question. The Inji filter is `{"type":"object","pattern":"KarnatakaFarmerCard"}` on `$.type`. A JSON Schema
validator applies `type: object` to an array and fails. So the filters of standard verifiers and Inji's filters
don't match each other's credentials.

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
Hand-write a VCDM 2.0 configuration whose `@context` lacks `https://w3id.org/security/suites/ed25519-2020/v1`.
Sign with `Ed25519Signature2020`. Certify issues it. jsonld.js in safe mode (the Reference Verifier) rejects the
undefined `proof.type` term.

### G17: did:web with a port
Set `CERTIFY_DEFAULT_DID=did:web:playground.localhost%3A8080:pub:issuers:certify` in local mode and verify a
status-list credential. You get `Invalid URL host`. So local mode uses URL keys. Tunnel mode (port 443, no `%3A`)
uses did:web.

### G21: unresolvable status list
Issue a revocable credential. Then make its `statusListCredential` URL unreachable (stop Certify, or rewrite the
host) and present it. Inji Verify answers `VP_VERIFICATION_FAILED` with "runtime exception" for the whole
presentation. It should report a failed status check on that credential instead.

### G22: DCQL to Verify 0.18.2
Run the Farmer Card against Inji Verify with **Query: DCQL** (Matrix M11). The inspector shows Verify's answer to
`POST /vp-request` with a `dcqlQuery`: HTTP 400
`{"errorCode":"BOTH_ID_AND_PD_CANNOT_BE_NULL","errorMessage":"Both Presentation Definition and Presentation Definition ID cannot be empty."}`.
The playground explains this as `QUERY_LANGUAGE_UNSUPPORTED`.

### G23: validFrom without milliseconds
Create a configuration whose template hard-codes `"validFrom": "2024-01-02T00:00:00Z"`. Issuance returns HTTP 500
(`DateTimeParseException` in the ledger). `2024-01-02T00:00:00.000Z` works.

### G24: vct longer than 100 characters
Create an SD-JWT configuration in Certify whose `vct` is longer than 100 characters. One example is the readable
`<base>/pub/issuers/agri-dept/types/KarnatakaFarmerCard` on a four-word `trycloudflare.com` host (101
characters). Then issue it. You get `ERROR_SIGNING_QR_DATA`, with `value too long for type character varying(100)`
in Certify's log. The playground now switches to `<base>/pub/vct/<id>` when the readable form would be too long
(`vctFor` in [core/studio.ts](../packages/core/src/studio.ts)). So the bundle itself no longer hits this.

### G25: the SDK's by-value request
```bash
curl -s -X POST localhost:8080/pub/verify/v1/verify/vp-session-request -H 'content-type: application/json' \
  -d '{"clientId":"inji-playground","nonce":"MTc2","acceptVPWithoutHolderProof":false,
       "presentationDefinition":{"id":"farmer","input_descriptors":[{"id":"farmer","constraints":{"fields":[
       {"path":["$.type"],"filter":{"type":"object","pattern":"KarnatakaFarmerCard"}}]}}]}}' | jq 'keys'
# ["authorizationDetails","expiresAt","requestId","transactionId"]   <- no requestUri
```
With `"clientId": "did:web:<host>:pub:verify:v1:verify"` (Verify's own DID), the same call returns `requestUri`.
Then `GET /vp-request/<id>` serves an EdDSA-signed `oauth-authz-req+jwt`. SDK 0.18.1 uses `request_uri` when it
is present. Otherwise it puts `presentation_definition` and `client_metadata` in the URL. For the request above,
that URL is 1,191 characters, which is QR version 28 at the SDK's error correction level M (24 at L). By
reference it is 177 characters (version 9). Every real request has more fields and grows from there. So runs and
the Verifier desk use Verify's DID as the client id by default ("Signed, by reference"). If you choose "Unsigned,
by value", you get this form.

### G26: QR size
Use the QR Lab (Capabilities page), or `POST /api/qr-lab/synthetic` with `photoKb`:

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

PixelPass (zlib and base45) shrinks plain JSON by about 20 %. A photo or a JWT is already compact, so base45's
overhead wins and the payload grows by 5 to 11 %. The SD-JWT's header alone is 3,312 characters, and 2,328 of
those are the `x5c` chain. That chain costs most of the size. The matrix's "direct share" rows (M4, M5) submit
the PixelPass payload directly. So they test verification, not camera scanning.

### G27: reported privately
Details withheld until MOSIP has had time to respond.

### G28: concurrent issuance
Start three runs of the same JSON-LD type at the same moment (`POST /api/runs` three times in parallel). On 11
Oct 2026, two of three failed with `invalid_proof` when the claims were identical (`run-c7mbyq`, `run-izg6ca`.
`run-hkvnrw` succeeded). One of three failed with distinct claims (`run-jg3rbg`). In every failed run, the proof
JWT's `nonce` equals its own token response's `c_nonce`, the holder keys differ, and `aud` and `iat` are correct.
So the wallet side is right. Sequential issuance (the matrix) never fails. I have not yet narrowed down the cause
inside Certify. A shared nonce cache entry is the likely candidate. Confirm with the maintainers before filing.

### G29: uploads under 10 KB
On the Verifier desk, choose **Upload a QR code image** and pick `valid-vc-dm-1.1.png` or `expired-vc.png` from
Inji Verify's documentation samples (3.4 KB and 4.4 KB). The SDK answers "File size not supported. The file size
should be between 10 KB and 5 MB" and never calls the service. Scale the same images up past 10 KB
(`ffmpeg -i in.png -vf scale=iw*2:ih*2:flags=neighbor out.png`) and they verify as SUCCESS and EXPIRED. I
checked this on 12 Oct 2026. The larger samples (`valid-vc-dm-2.0.png`, `invalid-vc.png`) upload normally.

### G30: walt.id's wallet cannot read Certify's metadata
With the external lab running, start a run with the wallet *walt.id Wallet (API)* and any Studio type (Matrix
X11, X12). Its "Accept the offer" step answers HTTP 400 `Element class kotlinx.serialization.json.JsonArray is
not a JsonObject`. The inspector shows walt.id fetching the offer and Certify's metadata through the gateway,
then stopping. The stack trace runs through `ClaimDescriptorNamespacedMapSerializer` inside
`CredentialSupported`. If you remove the one SD-JWT configuration from Certify
(`DELETE /v1/certify/credential-configurations/agri-dept__KarnatakaFarmerCard__sdjwt`, restored with
`POST /api/studio/reconcile`), walt.id gets past the metadata. Certify's shape follows OpenID4VCI draft 13
(Appendix A.3.2), so the fix belongs in walt.id.

### G32: `cnf.kid` versus `cnf.jwk`
Matrix X10: the Reference Wallet collects the SD-JWT Farmer Card from Certify and presents it to the walt.id
verifier. walt.id answers `signature_sd-jwt-vc: java.lang.NullPointerException … JWK.parse`. When you decode the
credential, you see `"cnf": {"kid": "did:jwk:…#0"}`. walt.id's own credentials (X6, accepted) use
`"cnf": {"jwk": {…}}`.

### G33: descriptor ids
Matrix X9: the walt.id wallet answers the Reference Verifier with `descriptor_map[0].id` set to
`waltid-demo-librarycard-vc-sd-jwt` (the definition id). The request's only input descriptor is
`waltid-demo-librarycard-vc-sd-jwt-credential`. The Reference Verifier's check "Every requested credential
answered" names both. X7 (the same wallet, Inji Verify) is accepted.

### G35: `request_uri` and the Accept header
Matrix X18: walt.id's wallet resolves an Inji Verify request whose `client_id` is Verify's DID. Its fetch of the
`request_uri` sends `Accept: application/json,application/json` and gets `406 Not Acceptable`. The inspector
records this as *Fetch request object*, with the actor "walt.id WebDataFetcher". The wallet then fails with
"AuthorizationRequest cannot be retrieved". The same request with `Accept: application/oauth-authz-req+jwt` or
`*/*` returns the JWT:
```bash
RU=$(curl -s -X POST localhost:8080/pub/verify/v1/verify/vp-request -H 'content-type: application/json' \
  -d '{"clientId":"did:web:playground.localhost%3A8080:pub:verify:v1:verify","nonce":"abcdefgh1",
       "presentationDefinition":{"id":"t","input_descriptors":[{"id":"c","constraints":{"fields":[{"path":["$.vct"]}]}}]}}' | jq -r .requestUri)
curl -s -o /dev/null -w '%{http_code}\n' -H 'accept: application/json' "$RU"                 # 406
curl -s -o /dev/null -w '%{http_code}\n' -H 'accept: application/oauth-authz-req+jwt' "$RU"  # 200
```
RFC 9101 makes the request object a JWT, so the wallet should accept that media type. Inji Verify could also
serve it for any `Accept`, as most authorization servers do. X7 (the by-value form) is accepted.

### G36: DCQL claim paths in Inji Verify 1.0
Run Collab's *Mock Verifiable Credential (VCDM 1.1)* with the Reference Wallet against *Inji Verify 1.0 (MOSIP
Collab)*. Use the DCQL query and ask for one claim (Matrix C3 and C4):
- *DCQL claim paths: From the credential* (`["credentialSubject","email"]`, as OpenID4VP 1.0 B.1.2 and its
  examples write them). Verify answers the submission with HTTP 400 `invalid_request` "vp_token ldp_vc credential
  does not contain a required claim path declared in the DCQL query. Path: [credentialSubject, email]".
- *From credentialSubject* (`["email"]`, as Inji's "Transition from PEX to DCQL" guide maps
  `$.credentialSubject.x`). Verify accepts it.

`["credentialSubject"]` and `["type"]` are refused the same way. So Verify only reads paths from inside
credentialSubject. The playground's Query Builder and Verifier desk show both forms side by side.

### G37: Mimoto's stale metadata URLs
```bash
curl -s https://api.collab.mosip.net/v1/mimoto/issuers | jq -r '.response.issuers[] | [.issuer_id, .wellknown_endpoint] | @tsv'
curl -s -o /dev/null -w '%{http_code}\n' https://injicertify-landregistry.collab.mosip.net/v1/certify/issuance/.well-known/openid-credential-issuer   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://injicertify-landregistry.collab.mosip.net/.well-known/openid-credential-issuer                     # 200
```
The playground falls back to the OpenID4VCI location and notes it on the Parties page.

### G38: issuer and signing key of Collab's mock credentials
Collect *Mock Verifiable Credential* from Collab (Wallet, then Collect from MOSIP Collab) and open it. `issuer`
is `did:web:injicertify-mock.collab.mosip.net`. `proof.verificationMethod` is
`did:web:inji.github.io:inji-config:collab:mock-identity#sLECdoF…`. That DID document
(`https://inji.github.io/inji-config/collab/mock-identity/did.json`) lists the key with itself as controller. The
issuer's own DID document lists the same key under the issuer DID. So the proof points at a key that the named
issuer does not control.

### G39: `EdDSA` versus `Ed25519`
Collect *Commercial Truck Pass* from Collab's TruckPass issuer with a wallet that signs its proof with
`alg: EdDSA`. You get HTTP 400 `invalid_proof` "Error encountered during proof jwt parsing". The issuer's
metadata lists `proof_signing_alg_values_supported: [RS256, PS256, ES256, ES256K, Ed25519]`. With `alg: Ed25519`
the proof passes (the Reference Wallet now picks a name that the issuer lists). Collab's 1.0 issuers list
`EdDSA`.

### G40: demo UINs without records
Collect from each auto-sign-in issuer with each published UIN (Wallet, then Collect from MOSIP Collab, then Demo
identity). On 23 Oct 2026 the results were:
- The mock and Farmer issuers know all of the UINs.
- Land registry only knows 2154189532 and 5614273165.
- The mDL issuer only knows 2154189532.
- TruckPass knows none.

### G41: the Land registry's signing key is not in its DID document
Collect *Statement of the Status of Information Declared in CAR (VC DM2.0)* from Collab's Land registry (Wallet,
then Collect from MOSIP Collab). Present it to *Inji Verify 1.0 (MOSIP Collab)* (Matrix C7). The result call
answers HTTP 500 `VP_VERIFICATION_FAILED … PublicKeyResolutionFailedException: Public key extraction failed for
kid: did:web:inji.github.io:inji-config:collab:landregistry#0B6e9kc5PoTRd_L9FrmkVRCQG0pQbL9a3fRbrO9hddo`.
```bash
curl -s https://inji.github.io/inji-config/collab/landregistry/did.json | jq -r '.verificationMethod[].id'
# did:web:inji.github.io:inji-config:collab:landregistry#2Fx_l12c8_2xKT-I2QL1dF4UIncSNwyuAx11PxLDtdc   (no #0B6e9kc5…)
```
The keys of the mock and Farmer issuers resolve (C2, C6). The MOSIP ID, insurance and mDL issuers publish no DID
document at the same place (404). I did not verify their credentials here.

## MOSIP Collab (Inji 1.0.0-alpha.1)

The C rows of the matrix run against MOSIP's hosted sandbox, with the playground on this machine. Nothing is
changed on Collab. This is what works:

- **Authorization code issuance** from Collab's Inji Certify (1.0 line: PKCE, `private_key_jwt`, the nonce
  endpoint, `credential_configuration_id` and `proofs`). The Reference Wallet signs in at Collab's eSignet with a
  published demo UIN and the static OTP (C1 to C8). The mDL issuer issues an **mso_mdoc** this way too.
- **Inji Verify 1.0** verifies those credentials over OpenID4VP 1.0 with DCQL (C1, C2, C4 to C6) and by direct
  share (C8). It refuses Presentation Exchange (C9, the mirror of M11).
- **Across the version split** (checked 23 Oct 2026, all accepted): Collab's 1.0 credentials, W3C and SD-JWT, work
  at the bundled Inji Verify 0.18.2 (C10, C11). The bundled Certify 0.14 SD-JWT works at Collab's Inji Verify 1.0
  (C12). C13 is a bundled W3C credential at Collab's Verify. It needs a public URL, because Collab's Verify must
  fetch the local issuer's did:web. So it only runs in tunnel mode.
- **What does not work:** nobody can verify the Land registry's credentials (G41, C7).
- **Security:** Verify 1.0 rejects a stale nonce, a missing KB-JWT, an altered claim and someone else's
  credential (C16, C17, C19 to C21). So G19 and G20 are fixed. G11 is still present there (C18).

## External parties

The X rows of the matrix put Inji next to an independent stack. I wrote no code for walt.id. The parties file
describes every call. This is what works:

- A credential from **an issuer that is not Inji** (walt.id, SD-JWT VC signed with its own key and `x5c`) is
  collected by the Reference Wallet and **verified by Inji Verify**. This works over OpenID4VP (X1, X3) and by
  direct share (X2). Tampering is still caught (X13). This is the case the mentors described at AMA 2.
- **A wallet that is not Inji** (walt.id's wallet API) presents to Inji Verify (X7) and to walt.id's verifier
  (X8).
- The Reference Wallet presents to **a verifier that is not Inji** (X6). That verifier catches a stale nonce and
  an altered claim (X16, X17).
- The Reference Verifier only trusts the external issuer through the certificate listed in the parties file. So
  it rejects the forged-signature preset (X15), and G11 shows again at Inji Verify (X14).

**Animo's hosted playground** (Credo, `dc+sd-jwt`, OpenID4VCI 1.0) is a second real external issuer (A rows). The
Reference Wallet collects its Tax-ID. Inji Verify 0.18.2 accepts it (A1, A2) and so does Collab's Verify 1.0
(A3). An altered claim is rejected (A4). When presented to the Reference Verifier, the credential is refused only
because its `x5c` certificate (`CN=credo dcs`) is not in the trust list. That is by design, not a gap. Hovi's
test bed offers no issuer API (it is a browser app on a private backend), so it is not in the matrix.

These things do not work yet:
- G30: walt.id cannot collect from Certify.
- G32: walt.id cannot verify Certify's SD-JWTs.
- G33: walt.id's submission ids are wrong.
- G35: walt.id cannot fetch Inji Verify's signed requests.

G31 and G34 have workarounds.

## Tamper matrix (Reference Wallet, OpenID4VP cross-device, Presentation Exchange)

For every tamper preset, the verifier is expected to **reject**. ✅ means rejected (correct). ❌ means accepted.

| Tamper preset | Inji Verify · ldp_vc | Inji Verify · SD-JWT | Reference Verifier · ldp_vc | Reference Verifier · SD-JWT |
|---|---|---|---|---|
| Alter a claim | ✅ `ERR_SIGNATURE_VERIFICATION_FAILED` | ✅ `ERR_INVALID_DISCLOSURE` | ✅ invalid signature | ✅ disclosure digest mismatch |
| Stale nonce | ✅ nonce validation failed | ❌ known gap (G19, withheld) | ✅ | ✅ |
| Drop holder proof | ✅ client id / nonce validation failed | ❌ known gap (G20, withheld) | ✅ | ✅ |
| Someone else's credential | ✅ `ERR_HOLDER_BINDING_CHECK_FAILED` | ✅ `ERR_INVALID_KB_SIGNATURE` | ✅ | ✅ |
| Forged SD-JWT | n/a | ❌ known gap (G11, withheld) | n/a | ✅ rejected |

With the walt.id issuer's Library Card (SD-JWT), Inji Verify rejects an altered claim (X13) and has the known
gap G11 again (X14). The Reference Verifier rejects the forgery (X15). walt.id's verifier rejects a stale nonce
(X16) and an altered claim (X17).

## Which to file first

MOSIP said at AMA 4 that a list of gaps per issuer, with test reports, is enough. Filing issues is optional. If
issues are filed, I suggest this order:
1. **G36** (inji-verify): Verify 1.0 and Inji's own migration guide read DCQL claim paths differently from
   OpenID4VP 1.0. So requests written to the spec reject honest presentations. It affects the release line that
   MOSIP is moving to. The C3 and C4 pair reproduces it in one click each.
2. **G4** (inji-verify): the 0.18.2 Compose database script breaks every OpenID4VP submission. It is easy to
   confirm and it blocks anyone trying the release.
3. **G24** (inji-certify): the `vct` column length breaks SD-JWT issuance for the URL `vct`s that the spec
   recommends.
4. **G1** (inji-verify): the `issuer` object form is rejected. There is a two-run reproduction.

G3, G5 and G18 can go together as one "injistack Compose at 0.14.0" issue. Link each issue here once it is
filed.

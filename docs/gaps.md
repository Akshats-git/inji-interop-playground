# Interoperability gaps found with the playground

Real problems the playground surfaced while wiring released Inji modules together, with evidence and the
workaround the playground applies. Versions: **Inji Certify 0.14.0, Inji Verify 0.18.2** (released images,
unmodified), vc-verifier 1.8.1 (inside Verify).

Severity: **High** = breaks a mainstream flow or weakens a security property; **Medium** = breaks a
standards-valid variant; **Low** = misleading behaviour or papercut.

> Status: draft, being extended as the playground's test matrix runs. Each entry will link the run that
> reproduces it and, where filed, the upstream issue.

| # | Component | Gap | Severity |
|---|---|---|---|
| G1 | Inji Verify / vc-verifier | A W3C-valid `issuer` **object** (`{"id": …, "name": …}`) is rejected with `ERR_INVALID_ISSUER` | Medium |
| G2 | vc-verifier | The HTTP(S) key resolver reads `publicKeyPem` whatever the key format, so URL-hosted `publicKeyMultibase` / `publicKeyJwk` keys never resolve | Medium |
| G3 | Certify (injistack Compose) | `certify_init.sql` at v0.14.0 has the pre-0.13 schema (`capacity` vs `capacity_in_kb`): every **revocable** credential fails with HTTP 500 | High |
| G4 | Inji Verify (Compose) | `db-init/init.sql` at v0.18.2 lacks `vp_submission.response_code*`: **every OpenID4VP submission** fails with HTTP 500 | High |
| G5 | Certify (injistack Compose) | The default cache list lacks `credentialOfferCache`: `/pre-authorized-data` fails ("credentialOfferCache not available"), i.e. the pre-authorized flow does not work out of the box | High |
| G6 | Certify | Errors come back as HTTP **200** with an `errors[]` envelope (`/pre-authorized-data`, `/actuator/health`); health checks and clients that trust status codes are misled | Low |
| G7 | Certify | Any `CertifyException` during issuance is re-labelled `ERROR_SIGNING_QR_DATA` (e.g. a JSON-LD context that fails to load) | Low |
| G8 | Certify | Velocity templates have no JSON escaping helper (`$_esc.json` is unavailable); templates written like the samples (`"${fullName}"`) let a claim value containing `"` break or inject JSON | Medium (security) |
| G9 | Certify | `sdJwtClaims` rejects `mandatory`, yet the pre-authorized validator reads `mandatory` from it, so mandatory SD-JWT claims cannot be configured through the API | Low |
| G10 | Certify | SD-JWT VCs carry no `iat`/`exp`/`nbf` (no expiry can be enforced) and are signed with the default self-signed `www.example.com (ROOT)` certificate in `x5c` | Medium |
| G11 | Inji Verify | SD-JWT issuer signatures are checked only against the `x5c` certificate the token itself carries, with no trust anchor: an SD-JWT **re-signed by an attacker** with a self-signed certificate is reported valid. Confirmed by tamper preset `self-signed-sdjwt` | **High (security)** |
| G12 | db_scripts | `certify-key_policy_def.csv` lacks `CERTIFY_VC_SIGN_EC_R1`, so ES256 signing fails on a database built from the release scripts; the DDL also relies on a fresh session's `search_path` | Low |
| G13 | Inji PE dialect | Inji's presentation definitions filter `$.type` with `{"type":"object","pattern":…}`, which is not valid JSON Schema for an array; spec-style `contains/const` filters may not match in Inji wallets | Medium |
| G14 | Inji Verify | `/vc-verification` (v1) answers only `INVALID` with no reason; the reason is only available from `/v2/vc-verification` | Low |
| G15 | Certify | A VCDM 2.0 credential signed with `Ed25519Signature2020` is accepted without the suite context (lenient JSON-LD processing drops the undefined proof type); strict processors reject it | Low |
| G16 | Certify | Standard JSON-LD contexts (`https://www.w3.org/ns/credentials/v2`, …) are fetched from the internet at **every signature**; a transient network error fails issuance (`Error occurred during canonicalization`). 1.0 adds a context loader | Medium |
| G17 | vc-verifier | `did:web` identifiers with a port (`did:web:host%3A8080:…`, as the did:web spec requires) fail with `Invalid URL host` because `%3A` is not decoded | Low |
| G18 | Certify (injistack Compose) | The keystore volume is mounted at `/home/mosip/CERTIFY_PKCS12`, but the image runs from `/home/inji`, so keys are **not persisted**: after a container re-create Certify refuses to start (`KER-KMA-004 No such alias`) until the database is wiped | High |
| G19 | Inji Verify | For SD-JWT presentations the **KB-JWT nonce is not compared with the request nonce** (the nonce check only covers JSON-LD VPs): a stale/replayed SD-JWT presentation is accepted. Confirmed by tamper preset `wrong-nonce` | **High (security)** |
| G20 | Inji Verify | An SD-JWT presented **without any KB-JWT** is accepted even when the request has `acceptVPWithoutHolderProof=false`. Confirmed by tamper preset `no-holder-proof` | **High (security)** |
| G21 | Inji Verify | When a credential's status list cannot be resolved, the whole presentation fails with an opaque `VP_VERIFICATION_FAILED` ("runtime exception") instead of a status-check error | Low |
| G22 | Inji Verify | A DCQL request (`dcqlQuery`, the 1.0 shape) to 0.18.2 fails with `BOTH_ID_AND_PD_CANNOT_BE_NULL` rather than a clear "query language not supported", so integrators mixing versions get a misleading error | Low |
| G23 | Certify | A template `validFrom` that is valid RFC 3339 but has no milliseconds (`2024-01-02T00:00:00Z`) makes issuance fail with HTTP 500 (`DateTimeParseException` in the ledger), so issuers cannot set their own validity dates freely | Low |

## Responsible disclosure

G11, G19 and G20 are security weaknesses in a released verifier. They should be reported to the MOSIP team
privately (security contact / maintainers) before any public GitHub issue; the playground's tamper presets
reproduce each one in a single click.

## Tamper matrix (Reference Wallet, OpenID4VP cross-device, Presentation Exchange)

Expected for every tamper preset: the verifier **rejects**. ✅ = rejected (correct), ❌ = accepted.

| Tamper preset | Inji Verify · ldp_vc | Inji Verify · SD-JWT | Reference Verifier · ldp_vc | Reference Verifier · SD-JWT |
|---|---|---|---|---|
| Alter a claim | ✅ `ERR_SIGNATURE_VERIFICATION_FAILED` | ✅ `ERR_INVALID_DISCLOSURE` | ✅ invalid signature | ✅ disclosure digest mismatch |
| Stale nonce | ✅ nonce validation failed | ❌ **accepted** (G19) | ✅ | ✅ |
| Drop holder proof | ✅ client id / nonce validation failed | ❌ **accepted** (G20) | ✅ | ✅ |
| Someone else's credential | ✅ `ERR_HOLDER_BINDING_CHECK_FAILED` | ✅ `ERR_INVALID_KB_SIGNATURE` | ✅ | ✅ |
| Forged SD-JWT, self-signed x5c | n/a | ❌ **accepted** (G11) | n/a | ✅ not anchored in trusted issuer keys |

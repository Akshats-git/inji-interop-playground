# Interop report

> **Mode: fresh volumes.** Run right after `./playground.sh reset` and `./playground.sh up`: new database, new Certify keys, demo content seeded from scratch.

Generated 2026-10-11T15:45:37.084Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0 · Inji Verify 0.18.2 · Reference Wallet / Reference Verifier (playground).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](../gaps.md).

| # | Credential | Format | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-wq1s6q` |
| M2 | Bachelor's Degree | ldp_vc (DM 1.1) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-bukdkw` |
| M3 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-0oyxtw` |
| M4 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-bcgqqa` |
| M5 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-nngeqq` |
| M6 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-txy7xa` |
| M7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ovgarq` |
| M8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-z0go5q` |
| M9 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-kpew8q` |
| M10 | Bachelor's Degree | ldp_vc (DM 1.1) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-tgwssa` |
| M11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-ekix4a` |
| M12 | Library Pass (expired) | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | reject | REJECTED | EXPIRED | ✅ | `run-wtb63g` |
| M13 | Library Pass (expired) | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-16bokg` |
| T1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-runywq` |
| T2 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-5u2hda` |
| T3 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-r7uv8a` |
| T4 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-cjyzuq` |
| T5 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-klqumq` |
| T6 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-optiva` |
| T7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-bi1xfq` |
| T8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-jggnka` |
| T9 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-5eh8bq` |
| T10 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-xxkhjq` |
| T11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-kjsj0w` |
| T12 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-kkgz9q` |
| T13 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-fuohqg` |
| T14 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-jtcvja` |
| T15 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-lmt0og` |
| T16 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-82fiyq` |
| T17 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-vmhyzg` |
| T18 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-0urx7w` |

**28/31** behaved as expected · **3** known gaps · **0** unexpected.

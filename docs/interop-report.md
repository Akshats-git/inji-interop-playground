# Interop report

Generated 2026-10-11T17:24:24.737Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0 · Inji Verify 0.18.2 · Reference Wallet / Reference Verifier (playground).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Format | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ch3oqa` |
| M2 | Bachelor's Degree | ldp_vc (DM 1.1) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xypxiw` |
| M3 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-54gftw` |
| M4 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2ahgkg` |
| M5 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-jymjhw` |
| M6 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-l1jq2a` |
| M7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-sqqohq` |
| M8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-hfwekw` |
| M9 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-eq9tka` |
| M10 | Bachelor's Degree | ldp_vc (DM 1.1) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-givabq` |
| M11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-effsxq` |
| M12 | Library Pass (expired) | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | reject | REJECTED | EXPIRED | ✅ | `run-2f78ug` |
| M13 | Library Pass (expired) | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-rf0ogw` |
| T1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-dc1ocg` |
| T2 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-vymrba` |
| T3 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-wyglxq` |
| T4 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-qecoxg` |
| T5 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-5bpqrw` |
| T6 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-fdmznq` |
| T7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-bgfkzg` |
| T8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-b2mujg` |
| T9 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-jsx8xw` |
| T10 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-umpygq` |
| T11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-ajd4vw` |
| T12 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-czydrq` |
| T13 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-f5ubyq` |
| T14 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-2am2sq` |
| T15 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-oaqjaq` |
| T16 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-jmlzcw` |
| T17 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-ky3cna` |
| T18 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-xfla6g` |

**28/31** behaved as expected · **3** known gaps · **0** unexpected.

# Interop report

Generated 2026-10-11T09:23:15.739Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0 · Inji Verify 0.18.2 · Reference Wallet / Reference Verifier (playground).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Format | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-1xpvww` |
| M2 | Bachelor's Degree | ldp_vc (DM 1.1) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-hoabng` |
| M3 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-crfmxq` |
| M4 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-88mlfg` |
| M5 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zelntw` |
| M6 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-vb6oca` |
| M7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6cvuag` |
| M8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3l7kbw` |
| M9 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ge0c9q` |
| M10 | Bachelor's Degree | ldp_vc (DM 1.1) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3ohayq` |
| M11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-kcqp9w` |
| M12 | Library Pass (expired) | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | reject | REJECTED | EXPIRED | ✅ | `run-0qdqsq` |
| M13 | Library Pass (expired) | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-ag7riq` |
| T1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-nhzzga` |
| T2 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-idu3pq` |
| T3 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-qopsxw` |
| T4 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-srl3xa` |
| T5 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-gmpywg` |
| T6 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-gzl9aa` |
| T7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-wygndq` |
| T8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-yvi13a` |
| T9 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-es0vaq` |
| T10 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-ivwlkg` |
| T11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-cchjpg` |
| T12 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-skzxxa` |
| T13 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-kxvk6a` |
| T14 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-dswrgq` |
| T15 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-iotdpq` |
| T16 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-l1bmla` |
| T17 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-7pcivq` |
| T18 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-girmha` |

**28/31** behaved as expected · **3** known gaps · **0** unexpected.

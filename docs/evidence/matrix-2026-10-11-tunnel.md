# Interop report

> **Mode: tunnel.** The bundle ran with `./playground.sh tunnel` (a Cloudflare quick tunnel, every party on did:web at the public HTTPS URL). The script drives the playground from the same machine, which is why the target is 127.0.0.1; issuers, Certify and Verify used the public URL.

Generated 2026-10-11T11:58:16.302Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0 · Inji Verify 0.18.2 · Reference Wallet / Reference Verifier (playground).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted, and tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](../gaps.md).

| # | Credential | Format | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-mz3dmq` |
| M2 | Bachelor's Degree | ldp_vc (DM 1.1) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-o9dkfa` |
| M3 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-nxdq6g` |
| M4 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-8gmj0q` |
| M5 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-7avl1g` |
| M6 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-iuhq7w` |
| M7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-w1hrxg` |
| M8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-yialsa` |
| M9 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-tkwtoq` |
| M10 | Bachelor's Degree | ldp_vc (DM 1.1) | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-y3yxkw` |
| M11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-fxupmg` |
| M12 | Library Pass (expired) | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | none | reject | REJECTED | EXPIRED | ✅ | `run-qjondw` |
| M13 | Library Pass (expired) | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-k3ggig` |
| T1 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-xqbinq` |
| T2 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-igc18w` |
| T3 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-ipte5a` |
| T4 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-cjbnkq` |
| T5 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-afkmla` |
| T6 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-v0josg` |
| T7 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-pmg3pq` |
| T8 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-tsrnhg` |
| T9 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-xmv0rg` |
| T10 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-nm0aka` |
| T11 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-ddcc7g` |
| T12 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-zherow` |
| T13 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-ymlwrq` |
| T14 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-kaihda` |
| T15 | Karnataka Farmer Card | ldp_vc (DM 2.0) | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-kxzamq` |
| T16 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-xpnqow` |
| T17 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-5mg8xa` |
| T18 | Karnataka Farmer Card (SD-JWT) | vc+sd-jwt | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-kalvbw` |

**28/31** behaved as expected · **3** known gaps · **0** unexpected.

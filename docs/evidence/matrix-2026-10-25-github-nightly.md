# Interop report

Generated 2026-10-25T22:48:18.359Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0), MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet), and Animo's hosted OpenID4VC playground (Credo).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted, and tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](../gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-1wmzaa` |
| M2 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-dbxtrq` |
| M3 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xfwwlg` |
| M4 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-g0qgyg` |
| M5 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-jhanxq` |
| M6 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3xeyta` |
| M7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-7wnr8w` |
| M8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-1vkf9w` |
| M9 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-9fbxda` |
| M10 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zd148a` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-yqpwpg` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | reject | REJECTED | EXPIRED | ✅ | `run-xt9kcw` |
| M13 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-47fc5g` |
| M14 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-sgx10w` |
| M15 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xxegfa` |
| T1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-17bxea` |
| T2 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-wp3cgg` |
| T3 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-c6zedw` |
| T4 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-a99ofw` |
| T5 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-oeln4w` |
| T6 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-vndd0q` |
| T7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-3xr2ba` |
| T8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-018sma` |
| T9 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-upso1q` |
| T10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-rdw75w` |
| T11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-gnp2eq` |
| T12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-godsgq` |
| T13 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-3dhycg` |
| T14 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-zcwxsw` |
| T15 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-hpiymg` |
| T16 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-egbjbg` |
| T17 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-julxja` |
| T18 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-xqhema` |
| X1 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-cwshjw` |
| X2 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-jxke6w` |
| X3 | Open University Degree | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xtqkma` |
| X4 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-uawzka` |
| X5 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-erxytq` |
| X6 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6nmgea` |
| X7 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-avl1ba` |
| X8 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2e9tgq` |
| X9 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Reference Verifier | PE | OpenID4VP | none | accept | REJECTED | Every requested credential answered | ❌ G33 | `run-u5mctq` |
| X10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | REJECTED | REJECTED_BY_VERIFIER | ❌ G32 | `run-j55icg` |
| X11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-wrnhua` |
| X12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-dtirwq` |
| X13 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-r2un9w` |
| X14 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-xqr3ag` |
| X15 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-r9n2ow` |
| X16 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | wrong-nonce | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-yvgjvq` |
| X17 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | alter-claim | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-xbycjw` |
| X18 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G35 | `run-x5v4mw` |
| C1 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zvrx2q` |
| C2 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-rixrsa` |
| C3 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | invalid_request | ❌ G36 | `run-hbpbdw` |
| C4 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL (Inji paths) | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qpgaia` |
| C5 | Mock Verifiable Credential (VCDM 2.0) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-uwxrdg` |
| C6 | Farmer ID Card (VCDM 2.0) | Farmer ID Card (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-sbl6na` |
| C7 | STATEMENT OF THE STATUS OF INFORMATION DECLARED IN CAR (VC DM2.0) (VCDM 2.0) | AgroVeritas Property & Land Registry (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | VP_VERIFICATION_FAILED | ❌ G41 | `run-wibr9w` |
| C8 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xgglqw` |
| C9 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | PE | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-hqujng` |
| C10 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qrr4fg` |
| C11 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zbycua` |
| C12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-c2exma` |
| C14 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ekdpra` |
| C15 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | REJECTED | Holder signature valid | ❌ G15 | `run-eyw7iw` |
| C16 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-vz2ecq` |
| C17 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-lssrka` |
| C18 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-yef23a` |
| C19 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | invalid_request | ✅ | `run-hxg0ww` |
| C20 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-c6zcsq` |
| C21 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-x2d6xg` |
| A1 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-49rgkg` |
| A2 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-f3qjlq` |
| A3 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-r8h0qq` |
| A4 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-hy5s5g` |

**62/75** behaved as expected · **13** known gaps · **0** unexpected.

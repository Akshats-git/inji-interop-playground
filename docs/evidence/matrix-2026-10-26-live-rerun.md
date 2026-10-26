# Interop report

Generated 2026-10-26T10:57:46.026Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0), MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet), and Animo's hosted OpenID4VC playground (Credo).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted, and tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](../gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-u0wiig` |
| M2 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ssyorq` |
| M3 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-sb55ow` |
| M4 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-baagow` |
| M5 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-u0kcwq` |
| M6 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-gbirba` |
| M7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-bakybg` |
| M8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-9jvp8q` |
| M9 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-en7d7q` |
| M10 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-oo7eow` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-jtjd8w` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | reject | REJECTED | EXPIRED | ✅ | `run-b9nevq` |
| M13 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-bzdjeq` |
| M14 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-8yizcq` |
| M15 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-p7qqea` |
| T1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-izfueq` |
| T2 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-t2ujcq` |
| T3 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-tefafg` |
| T4 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-vbqbwg` |
| T5 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-jxg6vg` |
| T6 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-rra3sg` |
| T7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-cbihng` |
| T8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-huj39g` |
| T9 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-4tjnoq` |
| T10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-vmh31q` |
| T11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-s4llma` |
| T12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-nmqgnw` |
| T13 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-xxscfw` |
| T14 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-njji2q` |
| T15 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-7qetra` |
| T16 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-xubbta` |
| T17 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-syukra` |
| T18 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-wozmpg` |
| X1 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-d6s6bq` |
| X2 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-is20iq` |
| X3 | Open University Degree | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-lxvpea` |
| X4 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3wlv8q` |
| X5 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-hqykta` |
| X6 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-yffgja` |
| X7 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ttsoka` |
| X8 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-k7xaeg` |
| X9 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Reference Verifier | PE | OpenID4VP | none | accept | REJECTED | Every requested credential answered | ❌ G33 | `run-nhnnsw` |
| X10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | REJECTED | REJECTED_BY_VERIFIER | ❌ G32 | `run-yv15oq` |
| X11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-kik3uw` |
| X12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-ahpxwg` |
| X13 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-whpgxw` |
| X14 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-woo6gq` |
| X15 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-nbvy9w` |
| X16 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | wrong-nonce | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-erx6uw` |
| X17 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | alter-claim | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-iqb90g` |
| X18 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G35 | `run-sanp8w` |
| C1 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3pugyw` |
| C2 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-gftmaa` |
| C3 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | invalid_request | ❌ G36 | `run-1ixecq` |
| C4 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL (Inji paths) | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qewoew` |
| C5 | Mock Verifiable Credential (VCDM 2.0) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-sxxo1g` |
| C6 | Farmer ID Card (VCDM 2.0) | Farmer ID Card (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ca7m2w` |
| C7 | STATEMENT OF THE STATUS OF INFORMATION DECLARED IN CAR (VC DM2.0) (VCDM 2.0) | AgroVeritas Property & Land Registry (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | VP_VERIFICATION_FAILED | ❌ G41 | `run-y7bq7q` |
| C8 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-eykbyw` |
| C9 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | PE | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-exfvpa` |
| C10 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-74uhtq` |
| C11 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-bninca` |
| C12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-fxs1ug` |
| C14 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-n3rtog` |
| C15 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | REJECTED | Holder signature valid | ❌ G15 | `run-tpxa6q` |
| C16 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-wxckdg` |
| C17 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-dj7gaw` |
| C18 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-udubma` |
| C19 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | invalid_request | ✅ | `run-h0sgta` |
| C20 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-ucloqg` |
| C21 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-wxukxg` |
| A1 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zyy6gw` |
| A2 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | n/a | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-pky10g` |
| A3 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-4hxtsa` |
| A4 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-eg9efw` |

**62/75** behaved as expected · **13** known gaps · **0** unexpected.

# Interop report

Generated 2026-10-24T17:59:37.389Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0), MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet), and Animo's hosted OpenID4VC playground (Credo).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-vihpla` |
| M2 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-iomxwq` |
| M3 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ui7x9a` |
| M4 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-uoq47g` |
| M5 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-axjp0w` |
| M6 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-agiaig` |
| M7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-k7pa6g` |
| M8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6txbwa` |
| M9 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-h5mdrq` |
| M10 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-9iijtq` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-ifuxrw` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | reject | REJECTED | EXPIRED | ✅ | `run-p6fxgq` |
| M13 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-mocicg` |
| M14 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zzprbw` |
| M15 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-htge8a` |
| T1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-g75iiw` |
| T2 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-ehyipa` |
| T3 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-7poeda` |
| T4 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-jmgsya` |
| T5 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-9ynd7q` |
| T6 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-2y6hza` |
| T7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-bn4btq` |
| T8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-u0mp9g` |
| T9 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-lcjacg` |
| T10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-ywltxw` |
| T11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-h249sq` |
| T12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-wqphcg` |
| T13 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | VP_VERIFICATION_FAILED | ✅ | `run-99syzw` |
| T14 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-9pggka` |
| T15 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-jwlypa` |
| T16 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-rsrzjw` |
| T17 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-ufwceq` |
| T18 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-xvtgww` |
| X1 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-fulizg` |
| X2 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-buc05w` |
| X3 | Open University Degree | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-unzmyw` |
| X4 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-my1neg` |
| X5 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-hldz2a` |
| X6 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-f9zaqw` |
| X7 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-i16wsq` |
| X8 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-c9abnq` |
| X9 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Reference Verifier | PE | OpenID4VP | none | accept | REJECTED | Every requested credential answered | ❌ G33 | `run-oggj9g` |
| X10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | REJECTED | REJECTED_BY_VERIFIER | ❌ G32 | `run-oljmhg` |
| X11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-fegmeq` |
| X12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-t9n6jw` |
| X13 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-s5mpcw` |
| X14 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-anuriw` |
| X15 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-vzsmfw` |
| X16 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | wrong-nonce | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-gp0qng` |
| X17 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | alter-claim | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-xxexha` |
| X18 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G35 | `run-xukd7w` |
| C1 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qzzosa` |
| C2 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-lr3vza` |
| C3 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | invalid_request | ❌ G36 | `run-1nxyxq` |
| C4 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL (Inji paths) | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-e85wya` |
| C5 | Mock Verifiable Credential (VCDM 2.0) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-gm6cvq` |
| C6 | Farmer ID Card (VCDM 2.0) | Farmer ID Card (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-rsg85q` |
| C7 | STATEMENT OF THE STATUS OF INFORMATION DECLARED IN CAR (VC DM2.0) (VCDM 2.0) | AgroVeritas Property & Land Registry (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | VP_VERIFICATION_FAILED | ❌ G41 | `run-o0kshq` |
| C8 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-nllgnq` |
| C9 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | PE | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-k6aodq` |
| C10 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-eryloa` |
| C11 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-yx4sjq` |
| C12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-pvnaog` |
| C14 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2vsdga` |
| C15 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | REJECTED | Holder signature valid | ❌ G15 | `run-cngozq` |
| C16 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-vdd63w` |
| C17 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-jpplja` |
| C18 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-pz7o0q` |
| C19 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | invalid_request | ✅ | `run-obb50w` |
| C20 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-dwmq6g` |
| C21 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-4fzmtq` |
| A1 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-wwvalq` |
| A2 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6bzptq` |
| A3 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-xgoucw` |
| A4 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-xc6ubg` |

**62/75** behaved as expected · **13** known gaps · **0** unexpected.

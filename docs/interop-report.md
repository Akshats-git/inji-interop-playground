# Interop report

Generated 2026-10-23T14:42:47.267Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0), and MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-fwgl4a` |
| M2 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-0teyja` |
| M3 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2lg3lg` |
| M4 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-bqytvw` |
| M5 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-3c0jkg` |
| M6 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zxqtfg` |
| M7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-jpksfw` |
| M8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-l8frxa` |
| M9 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-tmpk0w` |
| M10 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-swbqmw` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-xkcvda` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | reject | REJECTED | EXPIRED | ✅ | `run-xi1crg` |
| M13 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-dissvq` |
| M14 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-pssdlq` |
| M15 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qat60w` |
| T1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-bmbuoa` |
| T2 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-hvvh7q` |
| T3 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-cmbzlw` |
| T4 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-2srniw` |
| T5 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-kf3k1a` |
| T6 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-emrxwa` |
| T7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-xgnexa` |
| T8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-jfsfsa` |
| T9 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-wf67ea` |
| T10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-3xw1ia` |
| T11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-wfymda` |
| T12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-a2tmqq` |
| T13 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-oqqcaa` |
| T14 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-i2xxjg` |
| T15 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-kf4n2q` |
| T16 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-hfzkkw` |
| T17 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-ms65xw` |
| T18 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-vlxw1a` |
| X1 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-0yr8ma` |
| X2 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6dmn4w` |
| X3 | Open University Degree | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-cblsba` |
| X4 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-yutnya` |
| X5 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-thj6kg` |
| X6 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zbcgfg` |
| X7 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, by value | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ooozua` |
| X8 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-1xjkbg` |
| X9 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Reference Verifier | PE | OpenID4VP | none | accept | REJECTED | Every requested credential answered | ❌ G33 | `run-bxgcuq` |
| X10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | REJECTED | REJECTED_BY_VERIFIER | ❌ G32 | `run-fvsqjg` |
| X11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-34w3za` |
| X12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-vgdatq` |
| X13 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-eilxtg` |
| X14 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-iwjk6g` |
| X15 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-gdugpq` |
| X16 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | wrong-nonce | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-bana4q` |
| X17 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | alter-claim | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-3mwcug` |
| X18 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | NOT_REACHED | step_failed | ❌ G35 | `run-d7pqfq` |
| C1 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-6bm8lg` |
| C2 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-mt7brq` |
| C3 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | invalid_request | ❌ G36 | `run-s9ldtg` |
| C4 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL (Inji paths) | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-i8qnqg` |
| C5 | Mock Verifiable Credential (VCDM 2.0) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-gbqn0q` |
| C6 | Farmer ID Card (VCDM 2.0) | Farmer ID Card (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-fmpala` |
| C7 | STATEMENT OF THE STATUS OF INFORMATION DECLARED IN CAR (VC DM2.0) (VCDM 2.0) | AgroVeritas Property & Land Registry (MOSIP Collab) | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | REJECTED | VP_VERIFICATION_FAILED | ❌ G41 | `run-ujycjw` |
| C8 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-y6cyyw` |
| C9 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | PE | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-3duhlq` |
| C10 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-u1sfnw` |
| C11 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-fqvxjg` |
| C12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-ht3xia` |
| C14 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-kwxgna` |
| C15 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | REJECTED | Holder signature valid | ❌ G15 | `run-saxhha` |
| C16 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-2dmcoq` |
| C17 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-iq0pdq` |
| C18 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-ykxhjq` |
| C19 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | invalid_request | ✅ | `run-wbobnw` |
| C20 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-ocypxa` |
| C21 | Mock Verifiable Credential (VCDM 1.1) | Collab mock issuer (MOSIP Collab) | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-1jyheg` |

**58/71** behaved as expected · **13** known gaps · **0** unexpected.

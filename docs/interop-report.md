# Interop report

Generated 2026-10-12T17:34:44.560Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, and the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-q326qa` |
| M2 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-eswnqq` |
| M3 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-7e7nnw` |
| M4 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qjrazq` |
| M5 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zsmxlg` |
| M6 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-yvjccw` |
| M7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-osjgoq` |
| M8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-lvskyq` |
| M9 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qio4wg` |
| M10 | Bachelor's Degree | University of Veridonia | ldp_vc (DM 1.1) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-nbtxpw` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-qnzb6q` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | reject | REJECTED | EXPIRED | ✅ | `run-uwsqaa` |
| M13 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | reject | REJECTED | Not expired | ✅ | `run-vpwm9q` |
| T1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_SIGNATURE_VERIFICATION_FAILED | ✅ | `run-95sata` |
| T2 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-exl9dg` |
| T3 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Issuer signature valid | ✅ | `run-pdyeoq` |
| T4 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | alter-claim | reject | REJECTED | Disclosures match issuer digests | ✅ | `run-5ucrng` |
| T5 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | REJECTED | invalid_request | ✅ | `run-4nnwhw` |
| T6 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | wrong-nonce | reject | ACCEPTED | SUCCESS | ❌ G19 | `run-55ftxg` |
| T7 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-exwhvg` |
| T8 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | wrong-nonce | reject | REJECTED | Nonce matches | ✅ | `run-gvsckq` |
| T9 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | REJECTED | invalid_request | ✅ | `run-nmzwrw` |
| T10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | no-holder-proof | reject | ACCEPTED | SUCCESS | ❌ G20 | `run-2ax42w` |
| T11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Holder proof present | ✅ | `run-rtiy8q` |
| T12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | no-holder-proof | reject | REJECTED | Key-binding JWT present | ✅ | `run-iunebq` |
| T13 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_HOLDER_BINDING_CHECK_FAILED | ✅ | `run-5vezmw` |
| T14 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | foreign-holder | reject | REJECTED | ERR_INVALID_KB_SIGNATURE | ✅ | `run-3rsnra` |
| T15 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Bound to the presenter | ✅ | `run-dvdowg` |
| T16 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | foreign-holder | reject | REJECTED | Holder signature valid | ✅ | `run-q51zbg` |
| T17 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-vxrs9a` |
| T18 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-x2hzkw` |
| X1 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-7knn8a` |
| X2 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | — | direct share | none | accept | ACCEPTED | SUCCESS | ✅ | `run-uhmyow` |
| X3 | Open University Degree | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-g33wja` |
| X4 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-74byca` |
| X5 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qdxjnw` |
| X6 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-qi7ttg` |
| X7 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-9jbo7q` |
| X8 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | walt.id Verifier | own | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-zzlp7q` |
| X9 | City Library Card | walt.id demo issuer | vc+sd-jwt | walt.id Wallet (API) | Reference Verifier | PE | OpenID4VP | none | accept | REJECTED | Every requested credential answered | ❌ G33 | `run-mp2kga` |
| X10 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | none | accept | REJECTED | REJECTED_BY_VERIFIER | ❌ G32 | `run-gx8xhg` |
| X11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-khcfaw` |
| X12 | Karnataka Farmer Card (SD-JWT) | Karnataka Agriculture Department | vc+sd-jwt | walt.id Wallet (API) | Inji Verify 0.18.2 | PE | OpenID4VP | none | accept | NOT_REACHED | step_failed | ❌ G30 | `run-vvhj9q` |
| X13 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | alter-claim | reject | REJECTED | ERR_INVALID_DISCLOSURE | ✅ | `run-russ8w` |
| X14 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP | self-signed-sdjwt | reject | ACCEPTED | SUCCESS | ❌ G11 | `run-dvkx1q` |
| X15 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | Reference Verifier | PE | OpenID4VP | self-signed-sdjwt | reject | REJECTED | Issuer is trusted | ✅ | `run-lenzlw` |
| X16 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | wrong-nonce | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-eho7ta` |
| X17 | City Library Card | walt.id demo issuer | vc+sd-jwt | Reference Wallet | walt.id Verifier | own | OpenID4VP | alter-claim | reject | REJECTED | REJECTED_BY_VERIFIER | ✅ | `run-hpiyza` |

**40/48** behaved as expected · **8** known gaps · **0** unexpected.

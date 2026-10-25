# Interop report

Generated 2026-10-24T18:02:53.846Z by `apps/bff/scripts/matrix.ts` against http://127.0.0.1:8080.
Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier, the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0), MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet), and Animo's hosted OpenID4VC playground (Credo).

**Verdict** means *the journey behaved as expected*: honest presentations are accepted, and tampered or expired ones are rejected.
Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).

| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-mgd0jq` |
| M11 | Karnataka Farmer Card | Karnataka Agriculture Department | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | DCQL | OpenID4VP | none | reject | REJECTED | QUERY_LANGUAGE_UNSUPPORTED | ✅ | `run-bwqi8w` |
| M12 | Library Pass (expired) | University of Veridonia | ldp_vc (DM 2.0) | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | reject | REJECTED | EXPIRED | ✅ | `run-wwxszg` |
| C1 | Mock Verifiable Credential (SD-JWT) | Collab mock issuer (MOSIP Collab) | dc+sd-jwt | Reference Wallet | Inji Verify 1.0 (MOSIP Collab) | DCQL | OpenID4VP | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2rbxeq` |
| A1 | Tax-ID (Animo) | Animo playground, Federal Central Tax Office | vc+sd-jwt | Reference Wallet | Inji Verify 0.18.2 | PE | OpenID4VP, signed request_uri | none | accept | ACCEPTED | SUCCESS | ✅ | `run-2fos1a` |

**5/5** behaved as expected · **0** known gaps · **0** unexpected.

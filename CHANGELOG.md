# Changelog

## 1.0.0 (MOSIP Decode 2026 submission)

- Issuer Studio: design issuers and credential types (JSON-LD VCDM 1.1 and 2.0, SD-JWT VC) and push them to
  Inji Certify.
- Run builder: Issuer → Wallet → Verifier journeys over OpenID4VCI and OpenID4VP (Presentation Exchange and
  DCQL, signed and unsigned requests, PixelPass direct share), with a protocol inspector, a live sequence
  diagram and a PASS/FAIL report per run.
- Reference Wallet and Reference Verifier on independent libraries; five tamper presets.
- Parties: external issuers, wallets and verifiers declared in `infra/parties.yaml`; a walt.id lab.
- MOSIP Collab lane: authorization-code issuance through eSignet, Collab's Inji Verify 1.0 over DCQL, test-data
  panels, authorization-code offer QR for phones.
- Results matrix (75 journeys), capabilities and QR Lab, live traffic and decoder.
- One-command Compose bundle, Cloudflare tunnel mode for phones, CI and a nightly matrix workflow.
- 41 documented gaps between Inji components and the standards.

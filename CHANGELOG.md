# Changelog

## 1.0.1 (final submission)

- Run history is kept for 30 days by default (it was 7). Set `RETENTION_DAYS` to change it.
- Results matrix: a wider credential column that stays in view when you scroll sideways.
- Capabilities: the list of proven combinations is sorted.
- New guide, [docs/usage.md](docs/usage.md), with the step-by-step flows. The README is now a short front page.

## 1.0.0 (MOSIP Decode 2026 submission)

- Issuer Studio: design issuers and credential types (JSON-LD VCDM 1.1 and 2.0, SD-JWT VC) and push them to
  Inji Certify.
- Run builder: Issuer, Wallet and Verifier journeys over OpenID4VCI and OpenID4VP. It supports Presentation
  Exchange and DCQL, signed and unsigned requests, and PixelPass direct share. Each run has a protocol inspector,
  a live sequence diagram and a PASS/FAIL report.
- Reference Wallet and Reference Verifier on independent libraries, with five tamper presets.
- Parties: external issuers, wallets and verifiers declared in `infra/parties.yaml`, and a walt.id lab.
- MOSIP Collab lane: authorization-code issuance through eSignet, Collab's Inji Verify 1.0 over DCQL, test-data
  panels, and an authorization-code offer QR for phones.
- Results matrix (75 journeys), capabilities and QR Lab, live traffic and decoder.
- One-command Compose bundle, Cloudflare tunnel mode for phones, CI and a nightly matrix workflow.
- 41 documented gaps between Inji components and the standards.
- Interface follows mosip.io: white paper with faint wave lines, MOSIP navy and amber, Montserrat titles, a utility
  bar with live service status. Light is the default and dark stays as a toggle.

# Test results

Four layers of testing, from pure functions up to a browser:

| Layer | What | Where | Result (23 Oct 2026) |
|---|---|---|---|
| Unit | Core logic and BFF modules, no network | `pnpm test` | **73 passed**: core 30, bff 43 |
| Static | TypeScript in all three packages, shell script lint | `pnpm typecheck`, `shellcheck -S warning playground.sh` | clean |
| Interop matrix | 33 end-to-end journeys against the real Inji Certify and Inji Verify, plus 18 with external parties (walt.id), 20 with MOSIP Collab and 4 with Animo's hosted playground | `apps/bff/scripts/matrix.ts` | **30 / 3 known / 0 unexpected** local; **62 / 13 known / 0 unexpected** of 75 with everything |
| UI | Every page at 390 px and 1440 px in Chromium | Playwright | no console errors, no horizontal overflow, layout shift below 0.01 |

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the unit and static layers on every push and
pull request, then starts the whole Compose bundle and checks that Certify advertises the seeded types through
the gateway. A nightly workflow ([nightly-interop.yml](../.github/workflows/nightly-interop.yml)) runs the full
matrix on a fresh bundle with the external lab and attaches the report. Both workflows are written and pass their steps locally;
they have not run on GitHub yet, because the repository has not been pushed.

## Unit tests

```bash
pnpm install && pnpm test
```

**packages/core: 30 tests, 4 files**

| File | Covers |
|---|---|
| `decode.test.ts` | SD-JWT disclosures and key binding; credential offers by reference; secret masking keeps structure |
| `query.test.ts` | Presentation Exchange in Inji's dialect and the spec's, SD-JWT limit-disclosure, matching both dialects; DCQL mapping from PE and the combinations Inji Verify 1.0 rejects |
| `gaps.test.ts` | Known gaps are named only for the runs that reproduce them (G11, G19, G20, G30, G32, G33, G35, and on Collab G11, G15, G36, G41) and never for a run that behaved as expected or a new failure; credential states read Valid / Invalid / Valid but expired |
| `studio.test.ts` | Field-name rules; config ids scoped by issuer and format; did:web on HTTPS vs URL keys on HTTP; Velocity templates for VCDM 1.1 and 2.0, string escaping (G8), optional numbers, past expiry; signature suite → Certify key alias; SD-JWT configs; revocation only for 2.0; claim coercion; the `vct` length fallback (G24) |

**apps/bff: 43 tests, 8 files**

| File | Covers |
|---|---|
| `gateway.test.ts` | Certify's admin APIs are never exposed; `<issuer>/.well-known/*` mapping; each exchange is recorded, classified and attributed to its run |
| `exposure.test.ts` | The tunnel exposes only `/pub/*`, and a forged `X-Forwarded-Host` or Cloudflare-forwarded request cannot open the API; `PUBLIC_UI` opt-in; "this computer" = loopback or the container's bridge gateway, never the LAN |
| `sealed.test.ts` | AES-256-GCM round trip with no plaintext left; tampered ciphertext and a moved row (AAD) are rejected; wrong key sizes are refused |
| `match.test.ts` | The Reference Wallet answers PE in both dialects and DCQL by `vct`, discloses only what is asked, and finds nothing when nothing fits |
| `explain.test.ts` | Verdicts: an honest accept passes; "valid but expired" only when the signature holds; a rejected tamper passes and an accepted tamper is a finding; expired and tampered presentations are expected to be rejected; an external verifier's own policy results become checks without leaking the credential |
| `parties.test.ts` | The shipped `infra/parties.yaml` loads cleanly once the lab keys exist (`${jwk:…}` turns the PEM key into a JWK); a broken entry is skipped with the field named while the others load; missing `save` targets are caught; external types, wallets and verifiers join the registry; templates keep a whole placeholder's type and refuse unknown names; selectors read JSON paths with indexes, headers and URI query parameters; steps chain saved values, record every exchange, stop with the other side's answer, and say plainly when a party is down |
| `hosted.test.ts` | The shipped MOSIP Collab entry loads (verifier, `wallet-demo` client, test data) and an entry that names nothing to connect to is refused; claims read from OpenID4VCI 1.0, draft 13 and SD-JWT metadata; eSignet's login page with PKCE; a demo identity signed in the way eSignet's page does, each call bound to the transaction and recorded, and eSignet's refusals explained; authorization-code issuance with PKCE, `private_key_jwt`, the nonce endpoint and a 1.0 credential request; discovery through Mimoto with the spec-location fallback (G37) |
| `upgrade.test.ts` | A POST that offers an `h2c` upgrade (Java's HttpClient, ktor) keeps its body; a plain GET with the same offer still works |

The UI has no unit tests; it is covered by the browser checks below.

## Interop matrix

```bash
./playground.sh up
cd apps/bff && REPORT=../../docs/interop-report.md npx tsx scripts/matrix.ts
```

The script drives the Reference Wallet through 33 journeys against the running bundle, with no human in the
loop, and exits non-zero only on an **unexpected** result (a known gap is reported but does not fail it). When
the external lab is running (`./playground.sh up --external`) it adds the X rows, and when MOSIP Collab is
reachable it adds the C rows. `ONLY=C7,C19` reruns just those rows.

- **M1–M15**: honest journeys and expected rejections across both formats (JSON-LD VCDM 1.1 and 2.0, SD-JWT),
  both verifiers (Inji Verify, Reference Verifier), both query languages (PE, DCQL), OpenID4VP and direct
  share, and an expired credential. Inji Verify requests are signed (`request_uri`) by default; M14 and M15
  repeat M1 and M3 with the unsigned by-value request.
- **T1–T18**: five tamper presets (alter a claim, stale nonce, drop the holder proof, someone else's
  credential, forged SD-JWT) against both formats and both verifiers.
- **X1–X18**: external parties from [infra/parties.yaml](../infra/parties.yaml). The walt.id issuer's SD-JWT
  Library Card and Degree against Inji Verify (OpenID4VP and direct share), the Reference Verifier (PE and DCQL)
  and walt.id's verifier; walt.id's wallet against all three verifiers; walt.id's wallet collecting from Inji
  Certify; walt.id's verifier checking Certify's SD-JWT; tamper presets against Inji Verify, the Reference
  Verifier and walt.id's verifier.

- **C1–C21**: MOSIP Collab ([infra/parties.yaml](../infra/parties.yaml) `environments:`): the Reference Wallet
  signs in at Collab's eSignet with a published demo UIN and the static OTP, collects from Collab's Certify
  issuers (authorization code), and presents to Collab's Inji Verify 1.0 over DCQL. C1–C9: the mock issuer's
  SD-JWT and VCDM 1.1 / 2.0, Farmer and Land credentials, direct share and a PE request (refused); C3/C4: the two
  DCQL claim-path styles (G36); C10–C12: across the version split; C13: a bundled W3C credential at Collab's
  Verify, which needs a public URL and so runs only in tunnel mode (not run on 23 Oct); C14–C15: the Reference
  Verifier; C16–C21: tamper presets against Verify 1.0.

| Mode | When | Result | Report |
|---|---|---|---|
| Local, containerised bundle | 11 Oct 2026, 17:23 UTC | 28 / 3 known / 0 unexpected | [interop-report.md](interop-report.md) |
| Local, after the loopback-only port and reveal changes | 11 Oct 2026, 17:44 UTC | 28 / 3 known / 0 unexpected | (not kept; same rows) |
| Tunnel (did:web on a public HTTPS URL) | 11 Oct 2026, 11:58 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-tunnel.md](evidence/matrix-2026-10-11-tunnel.md) |
| Fresh volumes (after `reset`) | 11 Oct 2026, 15:45 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-fresh-volumes.md](evidence/matrix-2026-10-11-fresh-volumes.md) |
| Local, with the external lab | 12 Oct 2026 | 40 / 8 known / 0 unexpected (48 rows) | (superseded) |
| Local, with the external lab, signed Inji Verify requests | 19 Oct 2026 | 42 / 9 known / 0 unexpected (51 rows) | (superseded) |
| Local, with the external lab and MOSIP Collab | 23 Oct 2026 | 58 / 13 known / 0 unexpected (71 rows) | (superseded) |
| Local, with the external lab, MOSIP Collab and Animo, rebuilt images | 24 Oct 2026 | **62 / 13 known / 0 unexpected (75 rows)** | [interop-report.md](interop-report.md) |

The three known gaps are the same in every mode: **T6** (G19), **T10** (G20) and **T17** (G11), all in Inji Verify 0.18.2's SD-JWT handling (details withheld). The
Reference Verifier rejects all three (T8, T12, T18).

With the external lab, six more rows are known gaps, none of them in the playground: **X9** (G33, walt.id's
submission ids), **X10** (G32, walt.id cannot read Certify's `cnf.kid`), **X11–X12** (G30, walt.id cannot parse
Certify's metadata), **X14** (G11 again, now with a non-Inji issuer) and **X18** (G35, walt.id's wallet cannot
fetch Inji Verify's signed request). The tunnel and fresh-volume runs above predate the switch to signed
requests and the Collab rows, and have not been repeated. A first run on 12 Oct also hit G16 once
(T15 failed to issue twice in a row); the rerun was clean.

With MOSIP Collab, four more rows are known gaps: **C3** (G36, DCQL claim paths), **C7** (G41, the Land registry's
signing key is not in its DID document), **C15** (G15, a strict verifier cannot check Collab's JSON-LD) and
**C18** (G11, still present in Verify 1.0). Verify 1.0 rejects a stale nonce (C16), a
missing holder proof (C17), an altered claim (C19, C21) and someone else's credential (C20), so G19 and G20 are
fixed there. The first Collab run on 23 Oct had two unexpected rows: C7 (a new gap, now G41) and C19, whose
tamper altered nothing because the request asked for a claim that is not selectively disclosable in Collab's
SD-JWT (the verifier was right to accept it); C19 now asks for `dateOfBirth`. C13 is not run locally.

Problems found by running the matrix that have since been fixed or worked around:
- **G24.** In tunnel mode every SD-JWT issuance failed until long `vct` URLs were shortened to `/pub/vct/<id>`.
- **G16.** A transient failure to fetch a w3.org context fails issuance now and then. The Reference Wallet
  retries once, which is visible as a 400 followed by a 200 in run `run-ch3oqa`.

- **The gateway lost the body of a POST that offered an `h2c` upgrade.** walt.id's HTTP client (ktor) sends
  `Upgrade: h2c` on every request, and the upgrade handler passed such requests on without their bodies, so
  walt.id's token request and presentation failed with HTTP 500 from the playground. The handler now feeds the
  raw request back to the HTTP parser (`ws.ts`, covered by `upgrade.test.ts`); X7 passes since.
- **G31 and G34** (walt.id strictness and a matching bug) are worked around in the Reference Wallet and in
  `parties.yaml`.
- **Review on 19 Oct 2026.** The tunnel guard trusted a client-supplied `X-Forwarded-Host` over `Host`, so a
  request through the tunnel could reach `/api` by naming a local host; it now treats the request as public if
  any of `Host`, `X-Forwarded-Host` or Cloudflare's edge headers says so. The Results matrix keyed rows without
  the wallet, so walt.id-wallet runs overwrote Reference-Wallet runs in the same cell; rows now include the
  wallet and external verifiers get their own columns. Finished transit-line stations did not show their fill
  (two background classes competed). Reports labelled external issuers as Inji Certify. The expired demo type
  is now seeded on a fresh install.

### Beyond the matrix

These checks ran by hand on 11 Oct 2026 while finishing [gaps.md](gaps.md). Each is written up there with
steps to reproduce:

| Check | Result |
|---|---|
| A JSON-LD type with `issuer` as an object, against both verifiers | Inji Verify rejects (`ERR_INVALID_ISSUER`, `run-x5rtnq`); the Reference Verifier accepts (`run-pfofcw`): G1 |
| v1 vs v2 `vc-verification` on a rejected credential | v1 gives no reason; v2 does: G14 |
| Certify error status codes | HTTP 200 with an `errors[]` body: G6 |
| The Verify SDK's QR for a one-field PE request | 1,191 characters by value, QR version 28 at level M; Verify only offers `request_uri` to a DID client id: G25 |
| QR Lab sizes, synthetic photos 0–2.6 KB and real credentials | A 1 KB photo needs v27; the real SD-JWT (4.5 KB) fits no QR: G26 |
| Three concurrent issuances of one type | One or two of three fail with `invalid_proof`, though each proof uses its own `c_nonce`: G28 |
| The four sample QR codes from Inji Verify's docs, uploaded on the Verifier desk (12 Oct) | DM 1.1 valid: SUCCESS; expired: EXPIRED; tampered: INVALID; DM 2.0: signature and expiry valid, status list unreachable (its URL is `localhost:8090`), now shown check by check instead of "could not read". The two under 10 KB are refused by the SDK until scaled up: G29 |
| Add an issuer to `parties.yaml`, `./playground.sh restart` (12 Oct) | The new issuer and type appear in `/api/catalog` and the UI with no code change; with no offer API the run waits for a pasted offer (a non-offer is refused with 400), then completes: Inji Verify accepts (`run-mwuexq`). Entry removed afterwards |
| A person's wallet with an external issuer (12 Oct) | The run shows the issuer's offer QR and waits for *Continue*; the presentation is then picked up through the gateway: accepted (`run-xkphhw`). Input to a run that is not waiting answers 409 |
| Lab off, keys never generated (12 Oct, as in CI) | The walt.id issuer entry is skipped with "ENOENT … waltid-demo.cert.pem"; the verifier and wallet still load; `doctor` warns and exits 0 |

## UI checks

Every page was opened in Chromium (Playwright 1.56) at **390 × 844** and **1440 × 900** against the running
bundle (23 Oct 2026, after the matrix, so Results and the history are full), with the console, horizontal
overflow and layout shift (CLS) recorded:

| Page | Console errors | Horizontal overflow (390 / 1440) | Layout shift, CLS (390 / 1440) |
|---|---|---|---|
| Run (builder, with Collab and external parties) | none | 0 / 0 | 0.0008 / 0.0019 |
| Run detail (a Collab run) | none | 0 / 0 | 0 / 0.0019 |
| Issuer Studio | none | 0 / 0 | 0 / 0.0098 |
| Verifier desk | none | 0 / 0 | 0.0005 / 0.002 |
| Wallet (with *Collect from MOSIP Collab*) | none | 0 / 0 | 0 / 0.0041 |
| Parties (with the hosted section) | none | 0 / 0 | 0.002 / 0.002 |
| Results | none | 0 / 0 | 0 / 0.0019 |
| Capabilities | none | 0 / 0 | 0 / 0.0019 |
| Live traffic | none | 0 / 0 | 0 / 0.0053 |

The Results matrix scrolls sideways inside its own container at phone width; the page itself does not.
The screenshots in the README and [screenshots/](screenshots/) come from this pass.

**Layout shift history.** Until 19 Oct most pages scored above the 0.1 that counts as "good" at phone width
(Studio 0.50, Live traffic 0.42). Giving `main` a minimum height fixed most of them; on 23 Oct the Studio's
remaining 0.18 came from its issuer list loading after the page frame, and reserving the list's height while it
loads took it to 0. The animations themselves only move `transform` and `opacity` and honour
`prefers-reduced-motion`; frame timing and feel still need judging by eye on a real phone.

## Test data

- **Seeded on a fresh install** ([studio/seed.ts](../apps/bff/src/studio/seed.ts)): two issuers (Karnataka
  Agriculture Department, University of Veridonia) and four types: Karnataka Farmer Card as JSON-LD (VCDM 2.0,
  revocable) and as SD-JWT, Bachelor's Degree (VCDM 1.1), and Library Pass (already expired).
- **Matrix claims** ([scripts/matrix.ts](../apps/bff/scripts/matrix.ts)): synthetic holders such as "Ramesh
  Kumar, KA-MND-20931, Ragi, Mandya" and "Asha Rao, B.Tech, Computer Science".
- All data is synthetic; see [security-privacy.md](security-privacy.md).

## Not yet tested

- **A phone running Inji Wallet 1.0.0-alpha.1**, against the tunnel (bundled Certify 0.14) or against Collab.
  The tunnel path is exercised by the matrix with the Reference Wallet, and message-to-run attribution is
  unit-tested. A recorded phone run is still to be done for the demo video.
- **C13** (a bundled W3C credential at Collab's Verify) needs a public URL, so it only runs in tunnel mode.
- **Collab issuers other than mock, Farmer, Land and the mDL.** The mock, Farmer and Land credentials were
  collected and presented (matrix); the mDL's `mso_mdoc` was collected by hand and has no verifier here;
  TruckPass fails for every published UIN (G40); the MOSIP ID, insurance, GlobalID and TAN issuers were not
  exercised: their eSignets have no client the Reference Wallet can use, so only Inji Wallet on a phone can collect them (Parties page).
- **Inji Web** (wallet-initiated issuance), an optional extra.
- The CI workflows on GitHub itself (see above).
- A fresh clone on a second machine following only the README.

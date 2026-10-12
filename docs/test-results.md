# Test results

Four layers of testing, from pure functions up to a browser:

| Layer | What | Where | Result (12 Oct 2026) |
|---|---|---|---|
| Unit | Core logic and BFF modules, no network | `pnpm test` | **55 passed**: core 22, bff 33 |
| Static | TypeScript in all three packages, shell script lint | `pnpm typecheck`, `shellcheck -S warning playground.sh` | clean |
| Interop matrix | 31 end-to-end journeys against the real Inji Certify and Inji Verify, plus 17 with external parties (walt.id) | `apps/bff/scripts/matrix.ts` | **28 / 3 known / 0 unexpected** in every mode; with the external lab **40 / 8 known / 0 unexpected** of 48 |
| UI | Every page at 390 px and 1440 px in Chromium | Playwright | no console errors, no horizontal overflow |

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the unit and static layers on every push and
pull request, then starts the whole Compose bundle and checks that Certify advertises the seeded types through
the gateway. A nightly workflow ([nightly-interop.yml](../.github/workflows/nightly-interop.yml)) runs the full
matrix on a fresh bundle with the external lab and attaches the report. Both workflows are written and pass their steps locally;
they have not run on GitHub yet, because the repository has not been pushed.

## Unit tests

```bash
pnpm install && pnpm test
```

**packages/core: 22 tests, 3 files**

| File | Covers |
|---|---|
| `decode.test.ts` | SD-JWT disclosures and key binding; credential offers by reference; secret masking keeps structure |
| `query.test.ts` | Presentation Exchange in Inji's dialect and the spec's, SD-JWT limit-disclosure, matching both dialects; DCQL mapping from PE and the combinations Inji Verify 1.0 rejects |
| `studio.test.ts` | Field-name rules; config ids scoped by issuer and format; did:web on HTTPS vs URL keys on HTTP; Velocity templates for VCDM 1.1 and 2.0, string escaping (G8), optional numbers, past expiry; signature suite → Certify key alias; SD-JWT configs; revocation only for 2.0; claim coercion; the `vct` length fallback (G24) |

**apps/bff: 33 tests, 7 files**

| File | Covers |
|---|---|
| `gateway.test.ts` | Certify's admin APIs are never exposed; `<issuer>/.well-known/*` mapping; each exchange is recorded, classified and attributed to its run |
| `exposure.test.ts` | The tunnel exposes only `/pub/*`; `PUBLIC_UI` opt-in; "this computer" = loopback or the container's bridge gateway, never the LAN |
| `sealed.test.ts` | AES-256-GCM round trip with no plaintext left; tampered ciphertext and a moved row (AAD) are rejected; wrong key sizes are refused |
| `match.test.ts` | The Reference Wallet answers PE in both dialects and DCQL by `vct`, discloses only what is asked, and finds nothing when nothing fits |
| `explain.test.ts` | Verdicts: an honest accept passes; a rejected tamper passes and an accepted tamper is a finding; expired and tampered presentations are expected to be rejected; an external verifier's own policy results become checks without leaking the credential |
| `parties.test.ts` | The shipped `infra/parties.yaml` loads cleanly once the lab keys exist (`${jwk:…}` turns the PEM key into a JWK); a broken entry is skipped with the field named while the others load; missing `save` targets are caught; external types, wallets and verifiers join the registry; templates keep a whole placeholder's type and refuse unknown names; selectors read JSON paths with indexes, headers and URI query parameters; steps chain saved values, record every exchange, stop with the other side's answer, and say plainly when a party is down |
| `upgrade.test.ts` | A POST that offers an `h2c` upgrade (Java's HttpClient, ktor) keeps its body; a plain GET with the same offer still works |

The UI has no unit tests; it is covered by the browser checks below.

## Interop matrix

```bash
./playground.sh up
cd apps/bff && REPORT=../../docs/interop-report.md npx tsx scripts/matrix.ts
```

The script drives the Reference Wallet through 31 journeys against the running bundle, with no human in the
loop, and exits non-zero only on an **unexpected** result (a known gap is reported but does not fail it). When
the external lab is running (`./playground.sh up --external`) it adds the X rows.

- **M1–M13**: honest journeys and expected rejections across both formats (JSON-LD VCDM 1.1 and 2.0, SD-JWT),
  both verifiers (Inji Verify, Reference Verifier), both query languages (PE, DCQL), OpenID4VP and direct
  share, and an expired credential.
- **T1–T18**: five tamper presets (alter a claim, stale nonce, drop the holder proof, someone else's
  credential, forged SD-JWT) against both formats and both verifiers.
- **X1–X17**: external parties from [infra/parties.yaml](../infra/parties.yaml). The walt.id issuer's SD-JWT
  Library Card and Degree against Inji Verify (OpenID4VP and direct share), the Reference Verifier (PE and DCQL)
  and walt.id's verifier; walt.id's wallet against all three verifiers; walt.id's wallet collecting from Inji
  Certify; walt.id's verifier checking Certify's SD-JWT; tamper presets against Inji Verify, the Reference
  Verifier and walt.id's verifier.

| Mode | When | Result | Report |
|---|---|---|---|
| Local, containerised bundle | 11 Oct 2026, 17:23 UTC | 28 / 3 known / 0 unexpected | [interop-report.md](interop-report.md) |
| Local, after the loopback-only port and reveal changes | 11 Oct 2026, 17:44 UTC | 28 / 3 known / 0 unexpected | (not kept; same rows) |
| Tunnel (did:web on a public HTTPS URL) | 11 Oct 2026, 11:58 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-tunnel.md](evidence/matrix-2026-10-11-tunnel.md) |
| Fresh volumes (after `reset`) | 11 Oct 2026, 15:45 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-fresh-volumes.md](evidence/matrix-2026-10-11-fresh-volumes.md) |
| Local, with the external lab | 12 Oct 2026 | 40 / 8 known / 0 unexpected (48 rows) | [interop-report.md](interop-report.md) |

The three known gaps are the same in every mode: **T6** (G19, stale nonce accepted), **T10** (G20, no holder
proof accepted) and **T17** (G11, forged SD-JWT accepted), all in Inji Verify 0.18.2's SD-JWT handling. The
Reference Verifier rejects all three (T8, T12, T18).

With the external lab, five more rows are known gaps, none of them in the playground: **X9** (G33, walt.id's
submission ids), **X10** (G32, walt.id cannot read Certify's `cnf.kid`), **X11–X12** (G30, walt.id cannot parse
Certify's metadata) and **X14** (G11 again, now with a non-Inji issuer). A first run on 12 Oct also hit G16 once
(T15 failed to issue twice in a row); the rerun was clean.

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

Every page was opened in Chromium (Playwright 1.56) at **390 × 844** (2× scale) and **1440 × 900** against the
running bundle, with seeded data and real runs:

| Page | Console errors | Horizontal overflow (390 / 1440) | Layout shift, CLS (390 / 1440) |
|---|---|---|---|
| Run (builder) | none | 0 / 0 | 0.001 / 0 |
| Run detail (passed) | none | 0 / 0 | 0.158 / 0.038 |
| Run detail (known gap) | none | 0 / 0 | 0.158 / 0.071 |
| Issuer Studio | none | 0 / 0 | 0.502 / 0.082 |
| Verifier desk | none | 0 / 0 | 0.217 / 0.083 |
| Wallet | none | 0 / 0 | 0.158 / 0.066 |
| Results | none | 0 / 0 | 0.251 / 0.076 |
| Capabilities | none | 0 / 0 | 0.217 / 0.083 |
| Live traffic | none | 0 / 0 | 0.422 / 0.245 |
| Parties (12 Oct) | none | 0 / 0 | 0.197 / 0.052 |
| Run (builder), with external parties (12 Oct) | none | 0 / 0 | 0.001 / 0.002 |
| Run detail, walt.id wallet → Inji Verify (12 Oct) | none | 0 / 0 | 0.158 / 0.072 |
| Verifier desk, after the change (12 Oct) | none | 0 / 0 | 0.219 / 0.092 |
| Wallet, after the change (12 Oct) | none | 0 / 0 | 0.159 / 0.084 |

The screenshots in the README and [screenshots/](screenshots/) come from this pass.

**Known issue: layout shift.** At phone width most pages score above the 0.1 that counts as "good" for
Cumulative Layout Shift. Studio and Live traffic score above 0.25 (poor). The pages render their frame first and
then grow as data arrives from the API. Reserving space for the loading state, or showing skeletons of the
final size, would fix it. The animations themselves only move `transform` and `opacity` and honour
`prefers-reduced-motion`; frame timing and feel still need judging by eye on a real phone.

## Test data

- **Seeded on a fresh install** ([studio/seed.ts](../apps/bff/src/studio/seed.ts)): two issuers (Karnataka
  Agriculture Department, University of Veridonia) and four types: Karnataka Farmer Card as JSON-LD (VCDM 2.0,
  revocable) and as SD-JWT, Bachelor's Degree (VCDM 1.1), and Library Pass (already expired).
- **Matrix claims** ([scripts/matrix.ts](../apps/bff/scripts/matrix.ts)): synthetic holders such as "Ramesh
  Kumar, KA-MND-20931, Ragi, Mandya" and "Asha Rao, B.Tech, Computer Science".
- All data is synthetic; see [security-privacy.md](security-privacy.md).

## Not yet tested

- **A phone running Inji Wallet against the tunnel, end to end.** The tunnel path is exercised by the matrix
  with the Reference Wallet, and message-to-run attribution is unit-tested. A recorded phone run is
  still to be done for the demo video.
- **Inji Web** (wallet-initiated issuance) and the **Inji Verify 1.0** lane (DCQL), both optional extras.
- The CI workflows on GitHub itself (see above).
- A fresh clone on a second machine following only the README.

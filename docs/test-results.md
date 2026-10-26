# Test results

There are four layers of testing, from pure functions up to a browser:

| Layer | What | Where | Result (24 Oct 2026) |
|---|---|---|---|
| Unit | Core logic and BFF modules, no network | `pnpm test` | **73 passed**: core 30, bff 43 |
| Static | TypeScript in all three packages, shell script lint | `pnpm typecheck`, `shellcheck -S warning playground.sh` | clean |
| Interop matrix | 33 end-to-end journeys against the real Inji Certify and Inji Verify, plus 18 with external parties (walt.id), 20 with MOSIP Collab and 4 with Animo's hosted playground | `apps/bff/scripts/matrix.ts` | **30 / 3 known / 0 unexpected** local. **62 / 13 known / 0 unexpected** of 75 with everything. |
| UI | Every page at 390 px and 1440 px in Chromium | Playwright | no console errors, no horizontal overflow, layout shift below 0.01 |

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the unit and static layers on every push and
pull request. Then it starts the whole Compose bundle and checks that Certify advertises the seeded types through
the gateway. A nightly workflow ([nightly-interop.yml](../.github/workflows/nightly-interop.yml)) runs the full
matrix on a fresh bundle with the external lab and attaches the report. Both workflows have run on GitHub and
passed. The nightly run of 25 Oct 2026 started the bundle from scratch on a GitHub runner and got the same result as
the local run: 75 journeys, 62 as expected, 13 known gaps, 0 unexpected. Its report is kept in
[evidence/matrix-2026-10-25-github-nightly.md](evidence/matrix-2026-10-25-github-nightly.md).

## Unit tests

```bash
pnpm install && pnpm test
```

**packages/core: 30 tests, 4 files**

| File | Covers |
|---|---|
| `decode.test.ts` | SD-JWT disclosures and key binding. Credential offers by reference. Secret masking keeps the structure. |
| `query.test.ts` | Presentation Exchange in Inji's dialect and the spec's. SD-JWT limit-disclosure. Matching both dialects. DCQL mapping from PE, and the combinations Inji Verify 1.0 rejects. |
| `gaps.test.ts` | Known gaps are named only for the runs that reproduce them (G11, G19, G20, G30, G32, G33, G35, and on Collab G11, G15, G36, G41). They are never named for a run that behaved as expected or for a new failure. Credential states read Valid, Invalid or Valid but expired. |
| `studio.test.ts` | Field-name rules. Config ids scoped by issuer and format. did:web on HTTPS versus URL keys on HTTP. Velocity templates for VCDM 1.1 and 2.0, string escaping (G8), optional numbers, and past expiry. Signature suite to Certify key alias. SD-JWT configs. Revocation only for 2.0. Claim coercion. The `vct` length fallback (G24). |

**apps/bff: 43 tests, 8 files**

| File | Covers |
|---|---|
| `gateway.test.ts` | Certify's admin APIs are never exposed. The `<issuer>/.well-known/*` mapping. Each exchange is recorded, classified and attributed to its run. |
| `exposure.test.ts` | The tunnel exposes only `/pub/*`. A forged `X-Forwarded-Host` or a Cloudflare-forwarded request cannot open the API. The `PUBLIC_UI` opt-in. "This computer" means loopback or the container's bridge gateway, never the LAN. |
| `sealed.test.ts` | An AES-256-GCM round trip leaves no plaintext. Tampered ciphertext and a moved row (AAD) are rejected. Wrong key sizes are refused. |
| `match.test.ts` | The Reference Wallet answers PE in both dialects and DCQL by `vct`. It discloses only what is asked, and finds nothing when nothing fits. |
| `explain.test.ts` | Verdicts. An honest accept passes. "Valid but expired" only appears when the signature holds. A rejected tamper passes, and an accepted tamper is a finding. Expired and tampered presentations are expected to be rejected. An external verifier's own policy results become checks without leaking the credential. |
| `parties.test.ts` | The shipped `infra/parties.yaml` loads cleanly once the lab keys exist (`${jwk:…}` turns the PEM key into a JWK). A broken entry is skipped with the field named, and the others load. Missing `save` targets are caught. External types, wallets and verifiers join the registry. Templates keep a whole placeholder's type and refuse unknown names. Selectors read JSON paths with indexes, headers and URI query parameters. Steps chain saved values, record every exchange, stop with the other side's answer, and say plainly when a party is down. |
| `hosted.test.ts` | The shipped MOSIP Collab entry loads (verifier, `wallet-demo` client, test data), and an entry that names nothing to connect to is refused. Claims are read from OpenID4VCI 1.0, draft 13 and SD-JWT metadata. eSignet's login page with PKCE. A demo identity signs in the way eSignet's page does, each call is bound to the transaction and recorded, and eSignet's refusals are explained. Authorization-code issuance with PKCE, `private_key_jwt`, the nonce endpoint and a 1.0 credential request. Discovery through Mimoto with the spec-location fallback (G37). |
| `upgrade.test.ts` | A POST that offers an `h2c` upgrade (Java's HttpClient, ktor) keeps its body. A plain GET with the same offer still works. |

The UI has no unit tests. The browser checks below cover it.

## Interop matrix

```bash
./playground.sh up
cd apps/bff && REPORT=../../docs/interop-report.md npx tsx scripts/matrix.ts
```

The script drives the Reference Wallet through 33 journeys against the running bundle, with no person in the
loop. It exits non-zero only on an **unexpected** result. A known gap is reported but does not make it fail. When
the external lab is running (`./playground.sh up --external`), it adds the X rows. When MOSIP Collab is
reachable, it adds the C rows. `ONLY=C7,C19` reruns just those rows.

- **M1 to M15**: honest journeys and expected rejections. They cover both formats (JSON-LD VCDM 1.1 and 2.0, and
  SD-JWT), both verifiers (Inji Verify and the Reference Verifier), both query languages (PE and DCQL),
  OpenID4VP and direct share, and an expired credential. Inji Verify requests are signed (`request_uri`) by
  default. M14 and M15 repeat M1 and M3 with the unsigned by-value request.
- **T1 to T18**: the five tamper presets (alter a claim, stale nonce, drop the holder proof, someone else's
  credential, and a forged SD-JWT) against both formats and both verifiers.
- **X1 to X18**: external parties from [infra/parties.yaml](../infra/parties.yaml). These rows cover:
  - the walt.id issuer's SD-JWT Library Card and Degree against Inji Verify (OpenID4VP and direct share), the
    Reference Verifier (PE and DCQL) and walt.id's verifier;
  - walt.id's wallet against all three verifiers;
  - walt.id's wallet collecting from Inji Certify;
  - walt.id's verifier checking Certify's SD-JWT;
  - tamper presets against Inji Verify, the Reference Verifier and walt.id's verifier.
- **C1 to C21**: MOSIP Collab (`environments:` in [infra/parties.yaml](../infra/parties.yaml)). The Reference
  Wallet signs in at Collab's eSignet with a published demo UIN and the static OTP. It collects from Collab's
  Certify issuers (authorization code) and presents to Collab's Inji Verify 1.0 over DCQL.
  - C1 to C9: the mock issuer's SD-JWT and VCDM 1.1 / 2.0, Farmer and Land credentials, direct share, and a PE
    request (refused).
  - C3 and C4: the two DCQL claim-path styles (G36).
  - C10 to C12: across the version split.
  - C13: a bundled W3C credential at Collab's Verify. It needs a public URL, so it only runs in tunnel mode. I
    did not run it on 23 Oct.
  - C14 and C15: the Reference Verifier.
  - C16 to C21: tamper presets against Verify 1.0.

| Mode | When | Result | Report |
|---|---|---|---|
| Local, containerised bundle | 11 Oct 2026, 17:23 UTC | 28 / 3 known / 0 unexpected | [interop-report.md](interop-report.md) |
| Local, after the loopback-only port and reveal changes | 11 Oct 2026, 17:44 UTC | 28 / 3 known / 0 unexpected | not kept, same rows |
| Tunnel (did:web on a public HTTPS URL) | 11 Oct 2026, 11:58 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-tunnel.md](evidence/matrix-2026-10-11-tunnel.md) |
| Fresh volumes (after `reset`) | 11 Oct 2026, 15:45 UTC | 28 / 3 known / 0 unexpected | [evidence/matrix-2026-10-11-fresh-volumes.md](evidence/matrix-2026-10-11-fresh-volumes.md) |
| Local, with the external lab | 12 Oct 2026 | 40 / 8 known / 0 unexpected (48 rows) | superseded |
| Local, with the external lab, signed Inji Verify requests | 19 Oct 2026 | 42 / 9 known / 0 unexpected (51 rows) | superseded |
| Local, with the external lab and MOSIP Collab | 23 Oct 2026 | 58 / 13 known / 0 unexpected (71 rows) | superseded |
| Fresh clone, empty volumes (rows M1, M11, M12, C1, A1) | 24 Oct 2026 | 5 / 0 known / 0 unexpected | [evidence/matrix-2026-10-24-fresh-clone.md](evidence/matrix-2026-10-24-fresh-clone.md) |
| Local, with the external lab, MOSIP Collab and Animo, rebuilt images | 24 Oct 2026 | **62 / 13 known / 0 unexpected (75 rows)** | [interop-report.md](interop-report.md) |

The three known gaps are the same in every mode. They are **T6** (G19), **T10** (G20) and **T17** (G11). All three
are in Inji Verify 0.18.2's SD-JWT handling (details withheld). The Reference Verifier rejects all three (T8, T12
and T18).

With the external lab, six more rows are known gaps. None of them is in the playground:

- **X9** (G33): walt.id's submission ids.
- **X10** (G32): walt.id cannot read Certify's `cnf.kid`.
- **X11 and X12** (G30): walt.id cannot parse Certify's metadata.
- **X14** (G11 again, now with a non-Inji issuer).
- **X18** (G35): walt.id's wallet cannot fetch Inji Verify's signed request.

The tunnel and fresh-volume runs above came before the switch to signed requests and before the Collab rows. I
have not repeated them. A first run on 12 Oct also hit G16 once (T15 failed to issue twice in a row). The rerun
was clean.

With MOSIP Collab, four more rows are known gaps:

- **C3** (G36): DCQL claim paths.
- **C7** (G41): the Land registry's signing key is not in its DID document.
- **C15** (G15): a strict verifier cannot check Collab's JSON-LD.
- **C18** (G11): still present in Verify 1.0.

Verify 1.0 rejects a stale nonce (C16), a missing holder proof (C17), an altered claim (C19, C21) and someone
else's credential (C20). So G19 and G20 are fixed there. The first Collab run on 23 Oct had two unexpected rows.
C7 was a new gap, now G41. In C19, the tamper altered nothing, because the request asked for a claim that is not
selectively disclosable in Collab's SD-JWT. The verifier was right to accept it. C19 now asks for `dateOfBirth`.
C13 is not run locally.

Running the matrix turned up these problems. I have since fixed them or worked around them:

- **G24.** In tunnel mode, every SD-JWT issuance failed until I shortened long `vct` URLs to `/pub/vct/<id>`.
- **G16.** Now and then, a transient failure to fetch a w3.org context makes issuance fail. The Reference Wallet
  retries once. You can see this as a 400 followed by a 200 in run `run-ch3oqa`.
- **The gateway lost the body of a POST that offered an `h2c` upgrade.** walt.id's HTTP client (ktor) sends
  `Upgrade: h2c` on every request. The upgrade handler passed such requests on without their bodies. So walt.id's
  token request and presentation failed with HTTP 500 from the playground. The handler now feeds the raw request
  back to the HTTP parser (`ws.ts`, covered by `upgrade.test.ts`). X7 has passed since.
- **G31 and G34** (walt.id strictness and a matching bug) are worked around in the Reference Wallet and in
  `parties.yaml`.
- **Review on 19 Oct 2026.** I fixed five things:
  - The tunnel guard trusted a client-supplied `X-Forwarded-Host` over `Host`. A request through the tunnel could
    reach `/api` by naming a local host. Now the guard treats a request as public if any of `Host`,
    `X-Forwarded-Host` or Cloudflare's edge headers says so.
  - The Results matrix keyed rows without the wallet. So walt.id-wallet runs overwrote Reference-Wallet runs in
    the same cell. Rows now include the wallet, and external verifiers get their own columns.
  - Finished transit-line stations did not show their fill, because two background classes competed.
  - Reports labelled external issuers as Inji Certify.
  - The expired demo type is now seeded on a fresh install.

### Beyond the matrix

I ran these checks by hand on 11 Oct 2026 while finishing [gaps.md](gaps.md). Each one is written up there with
steps to reproduce:

| Check | Result |
|---|---|
| A JSON-LD type with `issuer` as an object, against both verifiers | Inji Verify rejects it (`ERR_INVALID_ISSUER`, `run-x5rtnq`). The Reference Verifier accepts it (`run-pfofcw`). This is G1. |
| v1 versus v2 `vc-verification` on a rejected credential | v1 gives no reason. v2 does. This is G14. |
| Certify error status codes | HTTP 200 with an `errors[]` body. This is G6. |
| The Verify SDK's QR for a one-field PE request | 1,191 characters by value, QR version 28 at level M. Verify only offers `request_uri` to a DID client id. This is G25. |
| QR Lab sizes, with synthetic photos of 0 to 2.6 KB and real credentials | A 1 KB photo needs v27. The real SD-JWT (4.5 KB) fits no QR. This is G26. |
| Three concurrent issuances of one type | One or two of the three fail with `invalid_proof`, though each proof uses its own `c_nonce`. This is G28. |
| The four sample QR codes from Inji Verify's docs, uploaded on the Verifier desk (12 Oct) | DM 1.1 valid: SUCCESS. Expired: EXPIRED. Tampered: INVALID. DM 2.0: signature and expiry valid, but the status list is unreachable (its URL is `localhost:8090`). The desk now shows this check by check instead of "could not read". The SDK refuses the two codes under 10 KB until you scale them up. This is G29. |
| Add an issuer to `parties.yaml` and run `./playground.sh restart` (12 Oct) | The new issuer and type appear in `/api/catalog` and the UI with no code change. With no offer API, the run waits for a pasted offer (a non-offer is refused with a 400), then completes. Inji Verify accepts it (`run-mwuexq`). I removed the entry afterwards. |
| A person's wallet with an external issuer (12 Oct) | The run shows the issuer's offer QR and waits for *Continue*. The presentation is then picked up through the gateway and accepted (`run-xkphhw`). Input to a run that is not waiting gets a 409. |
| Lab off, keys never generated (12 Oct, as in CI) | The walt.id issuer entry is skipped with "ENOENT … waltid-demo.cert.pem". The verifier and wallet still load. `doctor` warns and exits 0. |

## UI checks

I opened every page in Chromium (Playwright 1.56) at **390 × 844** and **1440 × 900** against the running bundle.
I did this on 25 Oct 2026, after the interface was restyled to follow mosip.io, with Results and the history full from
the 24 Oct matrix. The 23 Oct pass had the same result for the earlier look. I recorded the console, horizontal
overflow and layout shift (CLS):

| Page | Console errors | Horizontal overflow (390 / 1440) | Layout shift, CLS (390 / 1440) |
|---|---|---|---|
| Run (builder, with Collab and external parties) | none | 0 / 0 | 0.0019 / 0.0032 |
| Run detail (a Collab run) | none | 0 / 0 | 0.0004 / 0.0028 |
| Issuer Studio | none | 0 / 0 | 0 / 0.0076 |
| Verifier desk | none | 0 / 0 | 0.0004 / 0.0029 |
| Wallet (with *Collect from MOSIP Collab*) | none | 0 / 0 | 0.0004 / 0.0028 |
| Parties (with the hosted section) | none | 0 / 0 | 0.0022 / 0.0029 |
| Results | none | 0 / 0 | 0 / 0.0028 |
| Capabilities | none | 0 / 0 | 0.0004 / 0.0028 |
| Live traffic | none | 0 / 0 | 0.0004 / 0.0028 |

At phone width, the Results matrix scrolls sideways inside its own container. The page itself does not scroll
sideways. The screenshots in the README and in [screenshots/](screenshots/) were retaken in this pass, on the restyled interface.

**Layout shift history.** Until 19 Oct, most pages scored above 0.1 at phone width. That is the line for "good".
Studio scored 0.50 and Live traffic scored 0.42. Giving `main` a minimum height fixed most of them. On 23 Oct,
the Studio's remaining 0.18 came from its issuer list loading after the page frame. I reserved the list's height
while it loads, and the score dropped to 0. The animations only move `transform` and `opacity`, and they honour
`prefers-reduced-motion`. Frame timing and feel still need to be judged by eye on a real phone.

## Test data

- **Seeded on a fresh install** ([studio/seed.ts](../apps/bff/src/studio/seed.ts)): two issuers (Karnataka
  Agriculture Department and University of Veridonia) and four types. They are Karnataka Farmer Card as JSON-LD
  (VCDM 2.0, revocable) and as SD-JWT, Bachelor's Degree (VCDM 1.1), and Library Pass (already expired).
- **Matrix claims** ([scripts/matrix.ts](../apps/bff/scripts/matrix.ts)): synthetic holders such as "Ramesh
  Kumar, KA-MND-20931, Ragi, Mandya" and "Asha Rao, B.Tech, Computer Science".
- **MOSIP Collab demo identities** ([infra/parties.yaml](../infra/parties.yaml), `testData`). These are public mock
  data from docs.inji.io. The app shows them beside every sign-in. The OTP is always `111111`.

  | UIN | Who | Where it works |
  |---|---|---|
  | 2154189532 | Male adult | Mock, Farmer, Land registry and mDL issuers. This is the default for automatic sign-in. |
  | 5614273165 | Male adult | Mock, Farmer and Land registry issuers |
  | 5860356276 | Female adult | Mock and Farmer issuers |
  | 2089250384 | Female adult | Mock and Farmer issuers |
  | 3963293078 | Minor, 5 to 18 | Mock and Farmer issuers |
  | 5134067562 | Infant, under 5 | Mock and Farmer issuers |

  The insurance issuer uses Policy Number 12345, Full Name `insuranceCredentials` and date of birth 2000-01-01.
  The MOSIP ID and Tax issuers need your own UIN from [self-registration](https://self-register.collab.mosip.net/).
  Collab can change these records at any time.
- **Animo and walt.id** need no accounts. The playground asks them for an offer through their public APIs (Animo) or
  the local lab (walt.id).
- All data is synthetic. See [security-privacy.md](security-privacy.md).

## Not yet tested

- **A phone running Inji Wallet 1.0.0-alpha.1**, against the tunnel (bundled Certify 0.14) or against Collab.
  The matrix exercises the tunnel path with the Reference Wallet, and a unit test covers message-to-run
  attribution. No phone run is recorded.
- **C13** (a bundled W3C credential at Collab's Verify) needs a public URL, so it only runs in tunnel mode.
- **Collab issuers other than mock, Farmer, Land and the mDL.** I collected and presented the mock, Farmer and
  Land credentials (matrix). I collected the mDL's `mso_mdoc` by hand, and no verifier here can check it.
  TruckPass fails for every published UIN (G40). I did not exercise the MOSIP ID, insurance, GlobalID and TAN
  issuers. Their eSignets have no client that the Reference Wallet can use, so only Inji Wallet on a phone can
  collect them (see the Parties page).
- **Inji Web** (wallet-initiated issuance), an optional extra.
- A fresh clone on a second **person's machine**. On 24 Oct I ran a fresh `git clone` in an empty directory and
  started it under its own project name with no existing volumes (`PLAYGROUND_PROJECT=fresh-test
  ./playground.sh up --external`). It passed `doctor` and rows M1, M11, M12, C1 and A1 as expected. On 25 Oct the
  nightly workflow started the bundle from scratch on a GitHub runner and ran all 75 journeys, with the same
  62 / 13 / 0 result. No one else has run it yet.

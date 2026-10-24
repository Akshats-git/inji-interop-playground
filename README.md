# Inji Interoperability Playground

[![CI](https://github.com/Akshats-git/inji-interop-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/Akshats-git/inji-interop-playground/actions/workflows/ci.yml)
[![Nightly interop matrix](https://github.com/Akshats-git/inji-interop-playground/actions/workflows/nightly-interop.yml/badge.svg)](https://github.com/Akshats-git/inji-interop-playground/actions/workflows/nightly-interop.yml)

The Inji Interoperability Playground is a lab for the whole Verifiable Credential lifecycle on MOSIP's Inji stack.
In it you can:

- **design** your own issuer and credential types;
- **issue** them through a real Inji Certify;
- **hold** them in a wallet;
- **connect to MOSIP Collab**, MOSIP's hosted sandbox: its issuers, eSignet and Inji Verify 1.0;
- **present** them to a real Inji Verify or an independent verifier;
- **bring in parties that are not Inji** (other issuers, wallets and verifiers) by declaring them in a config
  file, with no code changes;
- **watch every protocol message** on the way.

Every journey ends in a PASS/FAIL verdict, and together the verdicts form an interoperability matrix that has
already surfaced real gaps between Inji components. It starts with one command.

Built for **MOSIP Decode 2026, problem statement 2**.

![A run of the Karnataka Farmer Card from Inji Certify through the Reference Wallet to Inji Verify, with the protocol inspector open](docs/screenshots/run-inspector.png)

## Quickstart

You need **Docker** with Compose 2.20 or newer, about **6 GB of memory** for Docker (the bundle uses about
3 GB) and about 3 GB of disk for images. It runs on Linux and macOS; on Windows, use WSL2 (not tested).

```bash
git clone https://github.com/Akshats-git/inji-interop-playground inji-interop-playground
cd inji-interop-playground
./playground.sh up        # builds the playground, starts Postgres, Inji Certify 0.14.0 and Inji Verify 0.18.2
```

Open **http://localhost:8080**. The first start downloads about 2 GB and takes a few minutes; Certify needs 1–3
minutes to boot. Demo issuers and credential types are created on first start.

```bash
./playground.sh doctor    # checks Docker, the containers and the gateway, and says what is wrong
./playground.sh down      # stops everything and keeps your data
./playground.sh logs certify   # follows one service's logs
./playground.sh reset     # deletes all data (asks first)
./playground.sh up --external   # also starts a non-Inji issuer, verifier and wallet (walt.id), see below
./playground.sh restart   # re-reads infra/parties.yaml after you edit it
```

## Your first five minutes

1. **Issuer Studio → Design a credential type.** Pick the *Karnataka Agriculture Department*, name the type,
   add fields, and choose a format (W3C JSON-LD with VCDM 1.1 or 2.0, or IETF SD-JWT VC) and a signature suite.
   The panel on the right shows exactly what Inji Certify will receive. Save: the playground pushes it to
   Certify's credential-configuration API, and Certify advertises it straight away.
2. **Run → Start run.** Pick the three parties in the **Issuer → Wallet → Verifier** columns: your type, the
   **Reference Wallet** and **Inji Verify**. The transit line fills as the credential is issued (OpenID4VCI,
   pre-authorized code), requested (OpenID4VP with Presentation Exchange, signed by Inji Verify), presented and
   verified, and the result says **Valid**, **Invalid** or **Valid but expired** (try *Library Pass (expired)*).
3. **Open the protocol inspector** on the run page. Every message is there in order, decoded and labelled. You
   can see the credential offer, the token exchange, the proof JWT over `c_nonce`, the issued credential, the
   presentation definition, the `vp_token` and Verify's result. Secrets are masked; *Reveal tokens* works on
   this computer only.
4. **Run it again with *Make the wallet misbehave* → Answer with a stale nonce**, once for the JSON-LD card and
   once for the SD-JWT card. Inji Verify rejects the first and accepts the second. That is gap G19.

## Running each flow

| Flow | How |
|---|---|
| **Design an issuer and credential types** | *Issuer Studio*. JSON-LD (VCDM 1.1 / 2.0, eight signature suites) or SD-JWT (ES256, EdDSA, RS256, ES256K), with optional revocation, selective disclosure per field, a hard-coded expiry, and branding. |
| **Issue to the Reference Wallet** | *Run* with wallet *Reference Wallet*, or *Wallet → Collect a credential* with any `openid-credential-offer://` link (also from other issuers). |
| **Issue to a phone** | *Run* with wallet *Inji Wallet (mobile)* in tunnel mode (below): scan the offer QR, or tap *Open in wallet app* on a phone. |
| **Present with OpenID4VP** | *Run* → *How the holder presents: OpenID4VP request*, with *Query language* Presentation Exchange or DCQL and *The verifier asks only for* to limit the claims. With Inji Verify, *Signed, by reference* (default: Verify's did:web as `client_id`, a small `request_uri` QR) or *Unsigned, by value* (gap G25). |
| **Present by direct share** | *Run* → *Direct share*: the credential is compressed with PixelPass, as in a QR code, and checked by Inji Verify. |
| **Verify with Inji's own SDK** | *Verifier desk → Ask a wallet*: Inji Verify's React SDK shows a request QR for any wallet (cross-device); opened on a phone, the SDK's same-device button opens the wallet app through an `openid4vp://` deep link. *Check a credential's QR code* scans or uploads one. *One question, two query languages* shows the same request as PE and DCQL side by side. |
| **Answer any verifier** | *Wallet → Answer a verifier*: paste an `openid4vp://` request from Inji Verify, the Reference Verifier or another verifier. |
| **Tamper on purpose** | *Make the wallet misbehave*: alter a claim, answer with a stale nonce, drop the holder proof, present someone else's credential, or forge an SD-JWT with a self-signed certificate. A correct verifier rejects all five. |
| **Compare results** | *Results*: the matrix (latest run per credential, wallet, verifier and presentation style; documented upstream gaps are marked with their id) and the full history, filterable. Every run has a Markdown and JSON report with claim values redacted. |
| **Claimed vs proven** | *Capabilities*: what Certify and Verify advertise, against what runs here have shown. The **QR Lab** measures any credential against Certify's and Inji Verify's QR limits, with and without PixelPass. |
| **Watch everything** | *Live traffic*: every message through the gateway, as it happens. The **Decoder** takes any JWT, SD-JWT, offer, request or PixelPass string and explains it. |
| **Use parties that are not Inji** | *Parties* lists every issuer, wallet and verifier, built in or from `infra/parties.yaml`. Their credential types appear in *Run* and the *Verifier desk*, their wallets and verifiers in *Run*, and *Wallet → Collect from an external issuer* gets a credential from them (next section). |
| **Run the whole matrix** | `cd apps/bff && npx tsx scripts/matrix.ts` (needs `pnpm install` once): 33 journeys with Inji and the reference parties, plus 18 with external parties when the external lab is running. No human needed. |

| | | |
|---|---|---|
| ![Issuer Studio](docs/screenshots/studio.png) | ![Results matrix](docs/screenshots/results.png) | ![Claimed and proven capabilities](docs/screenshots/capabilities.png) |
| ![Verifier desk](docs/screenshots/verify.png) | ![Live traffic](docs/screenshots/traffic.png) | ![A run on a phone-sized screen](docs/screenshots/run-mobile.png) |

## Adding issuers, wallets and verifiers that are not Inji

External parties are **configuration, not code**. [infra/parties.yaml](infra/parties.yaml) lists each external
issuer (its OpenID4VCI address, its credential types and the claims they carry), each verifier and each wallet,
and describes how to talk to them as a few HTTP steps with placeholders (`${claims}`, `${offerUri}`,
`${requestUri}`…). Edit the file and run `./playground.sh restart`: the *Parties* page, the *Run* builder, the
*Verifier desk* and the *Wallet* page pick the change up. A broken entry is reported on the *Parties* page and
skipped; the rest still load.

- **An external issuer's credential, verified by Inji Verify.** Pick its type in *Run* and verifier *Inji
  Verify*. The playground asks the issuer for an offer (its `offer` steps), the wallet collects it, and Inji
  Verify requests and checks it like any Certify credential. An issuer without an offer API gets an
  `offerPage` instead; the run then asks you to paste an offer.
- **An external wallet.** A phone wallet needs only a name and install links: a person scans the QR codes. A
  wallet with an API can be driven by the playground (`automation.receive` / `automation.present`).
- **An external verifier.** Its `request` steps create an `openid4vp://` request and its `result` steps read the
  verdict; any wallet in the playground can then answer it.
- **Trust.** The Reference Verifier trusts an external issuer's SD-JWTs only through the certificates or keys the
  file lists under `trust`.

`./playground.sh up --external` starts a ready-made lab of three such parties from the **walt.id** community
stack (issuer, verifier and wallet APIs 1.0.0, see [infra/external/README.md](infra/external/README.md)); the
shipped `parties.yaml` describes them. They run only on the Docker network, so they are for local runs, not for
phones.

![The Parties page: built-in and external wallets, issuers and verifiers](docs/screenshots/parties.png)

## Connecting to MOSIP Collab

MOSIP's hosted sandbox, **Collab**, is the playground's primary target (AMA 4): the playground runs on your
machine and connects to Collab's Inji Certify issuers, eSignet, Mimoto and **Inji Verify 1.0**. The local bundle
is what adds pre-authorized issuance, tampering and CI. Nothing needs configuring: `./playground.sh up` fetches
MOSIP's published test client key (`wallet-demo`) into `infra/collab/keys/`, and the **Collab** dot in the header
turns green when the sandbox is reachable.

- **Run → "MOSIP Collab, end to end"** (or pick any *MOSIP Collab* issuer and *Inji Verify 1.0 (MOSIP Collab)*).
  Collab only issues with the **authorization code flow**, so the Reference Wallet signs in at eSignet itself with
  one of MOSIP's public demo UINs and the static OTP `111111`, then collects and presents the credential. Choose
  *I'll sign in myself* to do the eSignet step in your own browser instead (redirect `http://localhost:3004`).
- **Wallet → Collect from MOSIP Collab** collects any Collab credential (Mock VC in VCDM 1.1 and 2.0 and SD-JWT,
  Farmer, Land registry, the mDL as `mso_mdoc`, and more). Next to every sign-in, the **test data** panel lists
  the demo UINs, the OTP and how to register your own UIN.
- **Phone:** Collab's issuers need no tunnel. Install **Inji Wallet 1.0.0-alpha.1**
  ([Android APK](https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8),
  [iOS TestFlight](https://testflight.apple.com/join/7FTAdjLe)), choose the issuer in the app, sign in with a demo
  UIN and OTP `111111`, then present to Collab's Inji Verify. This is the path Swati described at AMA 4; the playground's automated runs use the Reference Wallet instead, and a physical phone run is still to be recorded.
- **What it found there:** Collab's Verify 1.0 fixes G19 and G20 but still accepts a forged SD-JWT (G11), and
  reads DCQL claim paths differently from OpenID4VP 1.0 (G36); Collab's Land registry credentials cannot be
  verified by anyone (G41). See [docs/gaps.md](docs/gaps.md) (G36–G41).
- Inji Verify 1.0 speaks **DCQL only**, and **does not support `mso_mdoc`** (AMA 4).
![A run from Collab's mock issuer through the Reference Wallet to Collab's Inji Verify 1.0](docs/screenshots/collab-run.png)

- Collab is shared and can change at any time. Findings are dated 23 Oct 2026 and name the versions seen. With no
  internet, the matrix skips the C rows and everything local still works.

## Using a phone (Inji Wallet)

A phone wallet needs a public HTTPS URL to reach your computer. The playground can open a Cloudflare quick
tunnel without an account:

```bash
./playground.sh tunnel                         # or: ./playground.sh tunnel https://your.domain
./playground.sh doctor                         # checks the public URL too
```

- Install **Inji Wallet 1.0.0-alpha.1**, the version MOSIP points to at collab.mosip.net: the
  [Android APK](https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8) or the
  [iOS TestFlight](https://testflight.apple.com/join/7FTAdjLe). GitHub releases do not include one. Whether this
  alpha can collect a credential from the bundled Certify 0.14 has not been tested on a physical phone.
- Start a run with wallet *Inji Wallet (mobile)* and scan the offer QR with the app, then the presentation
  request QR. The run waits up to 10 minutes for the phone and attributes its messages to the run, so the
  inspector fills just as it does for the Reference Wallet.
- In tunnel mode every party is identified by **did:web** on the public host. Only the wallet-facing gateway
  (`/pub/*`) is reachable through the URL; the UI and the API stay on your computer (`PUBLIC_UI=true` in `.env`
  opts them in).
- The quick-tunnel URL changes every time the tunnel restarts. `./playground.sh up` switches back to local mode.

## What it found

The matrix runs **71 journeys**: 33 against the real Inji Certify 0.14.0 and Inji Verify 0.18.2, 18 more that mix in
walt.id's issuer, wallet and verifier (the external lab), and 20 against **MOSIP Collab** (Inji 1.0.0-alpha.1).
**58 behave as expected, 13 are known gaps and 0 are unexpected** (23 Oct 2026). The first 31 local rows also gave
the same verdicts over a tunnel and on fresh volumes (11 Oct).

| | Credential | Inji Verify 0.18.2 | Reference Verifier |
|---|---|---|---|
| Honest presentation, PE | JSON-LD 1.1 / 2.0, SD-JWT | ✅ accepted | ✅ accepted |
| Honest presentation, DCQL | JSON-LD 2.0, SD-JWT | ✗ not supported (0.x speaks PE only) | ✅ accepted |
| Direct share (PixelPass) | JSON-LD 2.0, SD-JWT | ✅ accepted | — |
| Expired credential | JSON-LD 2.0 | ✅ rejected | ✅ rejected |
| Altered claim, someone else's credential | both | ✅ rejected | ✅ rejected |
| Stale nonce, no holder proof, forged SD-JWT | SD-JWT | ❌ **accepted** | ✅ rejected |
| Honest presentation of an **external issuer's** SD-JWT (walt.id) | SD-JWT | ✅ accepted | ✅ accepted |
| An **external wallet** (walt.id) presenting | SD-JWT | ✅ accepted by value; ❌ cannot fetch a signed request (G35) | ❌ rejected: its submission ids break PE (G33) |

On **MOSIP Collab** (Inji Verify 1.0.0-alpha.1, DCQL only):

| | Credential | Result |
|---|---|---|
| Honest presentation of Collab's own credentials | JSON-LD 1.1 / 2.0, SD-JWT, Farmer | ✅ accepted |
| Presentation Exchange request | JSON-LD | ✅ refused (`UNKNOWN_FIELD`): the mirror of the 0.18.2 gap G22 |
| DCQL claim path written as OpenID4VP 1.0 says | JSON-LD | ❌ **rejected** (G36); Inji's own path style is accepted |
| Stale nonce, no holder proof, altered claim, someone else's credential | SD-JWT, JSON-LD | ✅ rejected (G19 and G20 are fixed) |
| SD-JWT re-signed with a self-signed certificate | SD-JWT | ❌ **accepted** (G11 is still there) |
| Collab's Land registry credential | JSON-LD 2.0 | ❌ cannot be verified: its signing key is not in its DID document (G41) |
| Collab credentials at the bundled Verify 0.18.2, and the bundled Certify 0.14 SD-JWT at Collab's Verify | both | ✅ accepted |

The full report is [docs/interop-report.md](docs/interop-report.md). [docs/gaps.md](docs/gaps.md) lists
**41 gaps** with evidence and steps to reproduce. The headlines:

- **The version split is real.** Inji Verify 0.x accepts Presentation Exchange only. A DCQL request (the
  OpenID4VP 1.0 shape that Verify 1.0 uses) fails with a misleading `BOTH_ID_AND_PD_CANNOT_BE_NULL` (G22).
- **Three SD-JWT verification weaknesses in Inji Verify 0.18.2** (G11, G19, G20), each reproducible with one
  tamper preset. The 1.0.0-alpha.1 on Collab fixes two and still has G11. They are being reported to MOSIP
  privately.
- **Collab's Verify 1.0 reads DCQL claim paths differently from OpenID4VP 1.0** (G36), so a spec-written request
  rejects honest presentations.
- **The reference setups do not work out of the box.** At the released tags, broken database scripts and
  configuration stop every OpenID4VP submission, revocable credentials and pre-authorized issuance (G3, G4,
  G5), and Certify's keys are not persisted (G18). The bundle fixes each one in configuration only.
- **Certify caps the SD-JWT `vct` at 100 characters** (G24), found by running over a tunnel.
- **Inji and an independent stack meet halfway.** Inji Verify verifies walt.id's credentials and accepts its
  wallet, but walt.id's wallet cannot read Certify's issuer metadata (G30) and its verifier cannot read the
  holder key in Certify's SD-JWTs (G32).
- **QR codes are tighter than they look.** A credential with a 1 KB face photo already needs QR version 27,
  Inji Verify's camera limit. A Certify SD-JWT is 4.5 KB, three quarters of it certificate chain, and fits no
  QR code at all (G26).

## How it works

The playground container serves the UI, the API and a **recording gateway** on one origin. Wallets reach Inji
Certify and Inji Verify only through the gateway's allow-listed `/pub/*` routes. Every exchange is classified,
attributed to its run, sealed with AES-256-GCM and pushed live to the browser. Certify and Verify run as
released images with configuration only. A **Reference Wallet** and **Reference Verifier**, written from the
specs on independent libraries, are the second implementation that every Inji result is compared against.

```mermaid
flowchart LR
  browser["Browser"] --> pg
  phone["Phone wallet"] -->|"tunnel, /pub/* only"| pg
  subgraph pg["playground :8080"]
    ui["UI"] --- api["/api"] --- gw["/pub/* recording gateway"]
    ref["Reference Wallet + Verifier"]
  end
  gw --> certify["Inji Certify 0.14.0"]
  gw --> verify["Inji Verify 0.18.2"]
  pg --> db[("Postgres<br/>sealed events")]
```

| Document | What is in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Components, the one-origin gateway, the reference parties, the event store, the live feed, local vs tunnel identities, Compose topology |
| [docs/api.md](docs/api.md) | Every `/api/*` route, the gateway's allow-list, the Reference Verifier and public documents |
| [docs/security-privacy.md](docs/security-privacy.md) | Synthetic data, sealing, masking, retention, what the tunnel exposes, what hosting it for others would need |
| [docs/test-results.md](docs/test-results.md) | Unit tests, the matrix in three modes, UI checks, known issues |
| [docs/interop-report.md](docs/interop-report.md) | The latest matrix run |
| [docs/gaps.md](docs/gaps.md) | Every gap with evidence, reproduction steps and where it should be reported |

## Coverage of the problem statement

| PS2 task | Status |
|---|---|
| **Connect to the MOSIP Collab services (the primary target, AMA 4)** | ✅ Collab's Certify issuers, eSignet and Inji Verify 1.0 as parties; Collab's Mimoto supplies the issuer list. [Section above](#connecting-to-mosip-collab) |
| Run the Inji stack end to end in one Docker Compose bundle (the add-on) | ✅ Certify + Verify + playground; Mimoto / Inji Web not bundled (Collab's are used) |
| Reverse proxy so a phone can reach it | ✅ one recording gateway, `./playground.sh tunnel` |
| Issuer → Wallet → Verifier UI, implementation chosen per section | ✅ three columns on the *Run* page |
| Create your own issuer and credential types | ✅ Issuer Studio, live in Certify |
| Issue over OpenID4VCI: offer QR on desktop, deep link on a phone | ✅ pre-authorized code (bundled Certify) |
| **Both** pre-authorized and authorization-code issuance, with the test data next to the sign-in (AMA 4) | ✅ authorization code (PKCE, `private_key_jwt`) against Collab, with the demo UINs and OTP beside it |
| Wallet-initiated issuance (Inji Web) | ☐ not yet |
| Present over OpenID4VP; Valid / Invalid / Valid-but-expired | ✅ cross-device QR, signed by Inji Verify; same-device deep link from the Verifier desk on a phone (Inji Verify SDK) and a tappable `openid4vp://` link on run pages; PE and DCQL. The result names the state: Valid, Invalid, Valid but expired |
| Direct share with PixelPass | ✅ |
| Protocol inspector with raw payloads, QR contents and the mechanism used | ✅ plus a live sequence diagram |
| Two formats end to end: W3C JSON-LD (VCDM 1.1 and 2.0) and IETF SD-JWT VC | ✅ |
| Pass/fail report per run | ✅ Markdown and JSON, redacted |
| Capabilities and QR limits | ✅ Capabilities page and QR Lab |
| PixelPass and the Inji Verify React SDK | ✅ |
| No plaintext PII at rest | ✅ AES-256-GCM sealing and a retention purge |
| Core services unmodified | ✅ configuration only |
| A non-Inji, standards-based party | ✅ Reference Wallet and Reference Verifier, plus walt.id's issuer, wallet and verifier in the external lab |
| External issuers, credential types, wallets and verifiers added by configuration (mentors, AMA 2) | ✅ `infra/parties.yaml` + `./playground.sh restart`, no code changes |
| A list of wallets (mentors, AMA 2) | ✅ *Parties* page |
| Replay and tamper | ✅ five presets |
| History dashboard | ✅ |
| Automated CI | ✅ CI and a nightly matrix workflow |
| Gap write-up | ✅ [gaps.md](docs/gaps.md); public issues to be linked |
| mDoc / mDL | ◐ Collab's mDL issuer's `mso_mdoc` is collected by the Reference Wallet; no verifier here can check an mDoc (Inji Verify does not support it) |
| Deployment to Collab | ✅ not needed: the playground connects *to* Collab |

## Versions and known limitations

| Component | Version |
|---|---|
| Inji Certify | 0.14.0 (`injistack/inji-certify-with-plugins`) |
| Inji Verify service / React SDK | 0.18.2 / 0.18.1 |
| PixelPass | 0.8.0 |
| MOSIP Collab (hosted, checked 23 Oct 2026) | Inji Verify 1.0.0-alpha.1; Certify issuers on the 1.0 line and the 0.x line; eSignet and Mimoto |
| External lab (optional) | walt.id issuer-api, verifier-api, wallet-api 1.0.0 |
| OpenID4VCI / OpenID4VP | draft 13 / draft 23 with PE (bundled Inji Verify); 1.0 / 1.0 with DCQL (Collab); both (Reference parties) |

- **One machine, one person.** The API has no login; it is safe because it is reachable only from this
  computer. See [security-privacy.md](docs/security-privacy.md) before hosting it anywhere else.
- **Use synthetic data only.** Nothing here is built for real identities.
- **Phone runs** are wired end to end (tunnel, did:web, attribution of the phone's messages), but the matrix
  covers them with the Reference Wallet rather than a physical phone.
- **The local bundle runs the stable 0.x line** (Certify 0.14.0, Verify 0.18.2). Docker images tagged
  `1.0.0-alpha.1` exist for Certify and Verify (published 31 Jul and 4 Aug 2026) and MOSIP's forum answer of
  13 Oct tells teams to use that tag; they are **not** bundled here. The 1.0 line is covered through MOSIP
  Collab, which runs it (DCQL against Collab's Verify 1.0, `dc+sd-jwt` and the nonce endpoint from Collab's
  Certify). Inji Web is not bundled either.
- **Collab is shared and can change.** Its findings are dated 23 Oct 2026; the C rows need internet and skip
  themselves without it. The Reference Wallet signs in with MOSIP's public demo UINs, never real identities.
- **A phone run with Inji Wallet 1.0.0-alpha.1 has not been recorded yet.** *Wallet → Collect from MOSIP Collab → Show the QR code
  for a phone* shows an authorization-code credential offer with the test data beside it, but whether the alpha
  wallet completes an offer scanned from outside Mimoto's issuer list (Collab's eSignet may not know its client)
  is untested.
- **mDoc** can be collected but not verified (no verifier supports `mso_mdoc`).
- **External parties** in the lab are reachable only inside Docker, so phone runs use Inji Certify. The parties
  file can describe internet-facing parties too; their traffic is recorded by the playground, but a phone's
  own calls to them are not (the run asks you to press *Continue*).
- Layout shift is below 0.01 on every page at 390 px and 1440 px ([test-results.md](docs/test-results.md#ui-checks)).

## Development

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

`packages/core` holds shared logic, `apps/bff` the API, gateway and reference parties, and `apps/ui` the React
app. To work on the BFF and the UI with live reload, run them on the host against the bundle's services (stop
the playground container first, since both use port 8080):

```bash
docker stop inji-playground-playground-1
docker compose --env-file .env -f infra/compose.yml -f infra/compose.dev.yml up -d   # Postgres, Certify, Verify on 127.0.0.1
cd apps/bff && DATABASE_URL=postgres://postgres:<POSTGRES_PASSWORD from .env>@127.0.0.1:5434/playground \
  EVENT_ENCRYPTION_KEY=<from .env> VERIFY_DID=<from .env> npx tsx src/main.ts                               # API + gateway on :8080
cd apps/ui && npx vite                                                               # UI with hot reload, proxied to :8080
```

`./playground.sh up` returns to the containerised bundle.

## Licence

[MPL-2.0](LICENSE), the same licence as Inji. Inji Certify, Inji Verify, the Inji Verify SDK and PixelPass are
MOSIP projects (MPL-2.0), used here as released.

Third-party parts, all under OSI-approved licences and unmodified:

| Part | Licence |
|---|---|
| walt.id issuer-api, verifier-api, wallet-api 1.0.0 (optional external lab) | Apache-2.0 |
| cloudflared (tunnel mode only) | Apache-2.0 |
| PostgreSQL 15 | PostgreSQL License |
| npm dependencies (`pnpm licenses list --prod`) | MIT, BSD, ISC, Apache-2.0, MPL-2.0, 0BSD, Zlib; Overpass fonts under OFL-1.1; jszip used under its MIT option |

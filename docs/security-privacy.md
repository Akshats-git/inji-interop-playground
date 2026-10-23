# Security and privacy

The playground is a **local test lab**. It records every protocol message between issuers, wallets and
verifiers, which is what makes it useful and also what makes it sensitive: those messages carry credentials,
tokens and claim values. This page covers what it protects, how, and what it deliberately does not do.

## Synthetic data only

- Everything the bundle seeds is invented: the *Karnataka Agriculture Department* and the *University of
  Veridonia*, holders such as "Ramesh Kumar, KA-MND-20931". The QR Lab's photos are random bytes.
- The Studio and the Run page accept any claim values. **Do not type real personal data into them.** Nothing
  in the playground is built for real identities: there is no consent flow, no access control and no audit
  trail.
- Credentials are signed with keys that live only in this bundle. Certify's SD-JWTs carry its default
  self-signed `www.example.com` certificate (gap G10), so nothing issued here is trusted anywhere else.

## Nothing personal at rest in plaintext

Anything that can contain claim values is sealed with **AES-256-GCM** before it reaches Postgres
([util/sealed.ts](../apps/bff/src/util/sealed.ts), [store/pg.ts](../apps/bff/src/store/pg.ts)):

| Sealed | Kept in the clear (for filtering) |
|---|---|
| Recorded request and response headers and bodies | Time, parties, method, path, HTTP status, message title, labels |
| Runs (spec with claim values, steps, results) | Status, verdict, format, wallet, verifier, mode, query, tamper preset |
| Held credentials (the Reference Wallet's) | Type, format, issuer, holder DID, dates |

- Each value gets a fresh 12-byte IV, and the row id is bound in as additional authenticated data, so a sealed
  value cannot be swapped onto another row without detection.
- The key is `EVENT_ENCRYPTION_KEY`: 32 random bytes that `./playground.sh` generates into `.env` on first
  start (`chmod 600`). The production image refuses to start without it. A changed key makes older rows
  unreadable; they are skipped with a single warning, and `./playground.sh reset` clears them.
- Issuer profiles and credential types are configuration (names, field labels, colours) and are stored as
  JSON.
- What is **not** sealed: Certify's and Verify's own databases. Certify keeps a ledger of issued credentials
  and Verify keeps submitted presentations, both by design. Synthetic data is what keeps these harmless.

## Retention

Runs, recorded messages and held credentials are purged after **`RETENTION_DAYS`** (default 7, set in `.env`).
The purge runs at start-up and every hour. `./playground.sh reset` deletes everything immediately: all volumes,
including Certify's signing keys. It asks for confirmation first.

## Masking and reveal

The inspector shows structure, not secrets. When the API returns a recorded message
([recorder.ts](../apps/bff/src/gateway/recorder.ts), `maskSecrets` in
[core/decode.ts](../packages/core/src/decode.ts)), these values are replaced with their first and last four
characters (`eyJi●●●●eBQA`): `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`,
`authorization`, `cookie`, `set-cookie`, `code`, `response_code`.

**Reveal tokens (this computer only)** shows them in full, for debugging a signature or decoding an access token.
The API honours `?reveal=1` only for a connection from the computer running the playground: loopback, or, in the
container, the Docker bridge gateway that the host's browser arrives through (`isThisComputer` in
[exposure.ts](../apps/bff/src/gateway/exposure.ts)). A request from the LAN, from another container or through
the tunnel gets masked values.

Event summaries pushed over the live feed never carry bodies.

## Redacted reports

Run reports (`/api/runs/:id/report`, Markdown or JSON) replace every claim value and the `tx_code` with
`‹redacted›` by default, so a report can be attached to an issue or shared with a maintainer. `?redact=false`
gives the full version.

## What the outside world can reach

```text
                         ┌─────────────── playground :8080 (published on 127.0.0.1 only) ───────────────┐
  this computer ────────▶│  UI   /api/*   /ws   /pub/*                                                  │
                         │                                                                               │
  phone ── tunnel ──────▶│  /pub/* only (everything else: 404, unless PUBLIC_UI=true)                    │
                         │      │                                                                        │
                         │      ├─ /pub/certify/*  allow-list ──▶ Certify (wallet endpoints only)        │
                         │      ├─ /pub/verify/*   allow-list ──▶ Verify  (wallet endpoints only)        │
                         │      └─ /pub/issuers, /pub/contexts, /pub/vct, /pub/ref-verifier (public docs) │
                         └───────────────────────────────────────────────────────────────────────────────┘
  Certify admin APIs (/credential-configurations, /pre-authorized-data, ledger, status updates):
  reachable only from the playground container over the internal Compose network.
```

1. **Only one port, only on this computer.** Postgres, Certify and Verify publish no ports. The playground's
   port is bound to `127.0.0.1`, so in local mode nothing on the LAN can reach the API.
2. **The tunnel exposes only `/pub/*`.** In tunnel mode the public URL is a real internet address. A wallet
   only ever needs the wallet-facing gateway, so the exposure guard
   ([exposure.ts](../apps/bff/src/gateway/exposure.ts)) answers 404 for the UI, `/api/*` and `/ws` when a
   request came through the public URL: its `Host` or any `X-Forwarded-Host` entry is the public host, or it
   carries Cloudflare's edge headers. (A forwarded header naming a local host never overrides that; until
   19 Oct it did, which let `X-Forwarded-Host: localhost` reach the API through the tunnel.) `PUBLIC_UI=true` in `.env` opts the UI and API in (to use the UI on a
   phone). It also exposes recorded tokens to anyone with the URL, so leave it off unless you need it, and
   only on a URL you control.
3. **Certify's admin APIs are never exposed.** In the reference setup they have no authentication: anyone who
   can reach them can define credential types, mint pre-authorized offers for any claims, or revoke
   credentials. The gateway forwards only an allow-list of wallet-facing endpoints
   ([proxy.ts](../apps/bff/src/gateway/proxy.ts)) and answers everything else with `404 not_exposed`, so these
   APIs are never reachable through the gateway, and therefore never through a tunnel. The BFF calls them over
   the internal network.
4. **Quick-tunnel URLs are unguessable but public.** Anyone who learns one can fetch issuer metadata, DID
   documents and keys, start a presentation request, or redeem an offer whose link they have seen. Stop the
   tunnel (`./playground.sh up` switches back to local) when you are done.
5. **CORS.** Public documents (`/pub/issuers/*`, `/pub/contexts/*`) send `access-control-allow-origin: *`,
   since they are public by nature. The gateway answers preflights with the caller's origin and
   `allow-credentials`, which the Verify SDK's session cookie needs; it only ever forwards the allow-listed
   wallet endpoints.

## External parties

[infra/parties.yaml](../infra/parties.yaml) makes the playground call parties outside the bundle, so it is
handled like code:

- **The playground only calls what the file names.** Every external call comes from a step in the file, or from
  the Reference Wallet following an offer or request a person gave it, and every one is recorded (sealed, like
  gateway traffic) with an *external party* label.
- **Step definitions stay on the server.** `/api/parties` returns names, addresses, types and health, never the
  steps: their bodies can carry an issuer's private key (the lab's comes from `${jwk:…}`) or a wallet login.
- **Keys and passwords go in files or the environment.** `${file:…}`, `${jwk:…}` and `${env:…}` are resolved
  when the file is read, so the YAML can be committed without them. The external lab's demo issuer key and
  certificate are generated by `./playground.sh up --external` into `infra/external/keys/`, which is
  git-ignored. The lab's wallet login (`lab@example.org`) is a fixed demo account on a service that exists only
  on the Docker network.
- **Trust is explicit.** The Reference Verifier accepts an external issuer's SD-JWT only if its key matches a
  certificate or key the entry lists under `trust`. Inji Verify 0.18.2 does not need (or use) that list (G11).
- **Placeholders fail closed.** A misspelled placeholder stops the step with a configuration error instead of
  sending `undefined` to someone else's server.
- **Synthetic data still applies.** Claim values typed into a run with an external issuer are sent to that
  issuer to be signed. Use made-up values, as everywhere else in the playground.

## MOSIP Collab (a hosted environment)

The Collab lane connects the playground to MOSIP's public sandbox over the internet. What that means for privacy:

- **Only MOSIP's public demo data goes there.** The identities are the mock UINs MOSIP publishes for the sandbox
  (listed in [infra/parties.yaml](../infra/parties.yaml)) and the static test OTP `111111`. The playground never
  asks for a real UIN or phone number and never stores one. Use your own self-registered UIN only through the
  interactive sign-in, in your own browser at eSignet: the playground sees the authorization code, not your OTP.
- **Automatic sign-in is deliberate and limited.** In "automatic" mode the Reference Wallet calls eSignet's
  own authentication API with a demo UIN and the static OTP, then exchanges the code. It exists so the matrix and
  the CI run need no person. It refuses to run for an environment without a published static OTP, and the
  interactive mode is always available.
- **The `wallet-demo` private key is MOSIP's, and public.** MOSIP publishes the test OIDC client's PKCS12 file and
  password in its documentation for everyone to use. `./playground.sh` downloads it into `infra/collab/keys/`
  (git-ignored, mounted read-only) so the Reference Wallet can authenticate to eSignet with `private_key_jwt`.
  It identifies a shared test client, not a person, and must never be reused for anything else. Its registered
  redirect is `http://localhost:3004/redirect`, so the playground publishes port 3004 on `127.0.0.1` only; the
  redirect page serves nothing but that path and checks the `state` of a sign-in the playground started itself.
- **The tunnel does not expose it.** In tunnel mode only `/pub/*` is public, as before; the `/api/hosted*` routes
  and port 3004 stay local.
- **Everything is recorded like any other run**, with tokens and claim values masked and sealed at rest. The
  credentials Collab's issuers produce hold fictional data (a farmer, a plot of land, a driving licence).
- **The sandbox is shared.** Collab can change or reset at any time and other participants use the same demo
  UINs, so a result is a snapshot: every Collab finding in [gaps.md](gaps.md) is dated and names the versions
  seen.

## No secrets in git

- `.env` holds the encryption key, the Postgres password and the mode settings. It is generated on first start
  and listed in `.gitignore`. [.env.example](../.env.example) documents every variable, with empty secrets.
- The Postgres password is random for every new database volume. An existing volume created before passwords
  were generated keeps the old default, and `./playground.sh` warns about it.
- The external lab's demo issuer key (`infra/external/keys/`) is generated on first use and git-ignored.
- `infra/collab/keys/` (MOSIP's public test client key, fetched by `./playground.sh`) is git-ignored too.
- Keystores (`*.p12`) are git-ignored and live in Docker volumes. The private keys the Reference Wallet and
  Reference Verifier use are generated at run time.
- Fixed values that remain are upstream defaults for local use: Certify's PKCS12 keystore password `local`
  and Verify's keystore password `mosip`. Both keystores sit inside volumes on this machine.

## Findings this lab surfaced about the Inji stack

Testing with tamper presets found weaknesses in Inji Verify 0.18.2 (G11, G19, G20: forged or replayed SD-JWT
presentations accepted; on Collab's Inji Verify 1.0.0-alpha.1, G19 and G20 are fixed but G11 is not) and in Certify 0.14.0 (G27: the access token's `sub` carries every claim value; G8:
templates without JSON escaping). They are being reported to MOSIP privately; see
[gaps.md](gaps.md#responsible-disclosure). The playground's own Reference Verifier rejects all of these
presentations; it is the comparison that shows the gap.

## Deploying beyond localhost

The playground is built for one person on one machine, or for a demo over a short-lived tunnel. Hosting it
for others (a shared lab, MOSIP Collab) would need at least:

1. **Authentication and authorisation on the Studio and the API.** Today anyone who reaches `/api` can create
   issuers and types in Certify, issue credentials with any claims, read every run (decrypted) and delete data.
   Put an identity-aware proxy or OIDC login in front of the UI, `/api` and `/ws`, with per-user or per-team
   workspaces, and keep `/pub/*` anonymous for wallets.
2. **Certify's admin APIs secured in Certify itself** (its OAuth-protected admin configuration), not only
   hidden by network position.
3. **Key management:** `EVENT_ENCRYPTION_KEY` from a secrets manager or KMS with rotation (re-sealing old rows),
   and Certify and Verify keys in an HSM (PKCS11) instead of PKCS12 files with default passwords.
4. **A real issuer identity:** a certificate chain for SD-JWT `x5c` that verifiers anchor in a trust list
   (G10, G11), and stable did:web hosts.
5. **Abuse limits:** rate limits on offer creation, runs and the QR Lab, and body-size limits at the edge
   (the gateway accepts up to 4 MB).
6. **Data protection:** a shorter retention, a privacy notice, and a hard rule (or validation) against real
   personal data.
7. **TLS everywhere**, with HSTS on the public origin, and `PUBLIC_UI` replaced by proper authentication.

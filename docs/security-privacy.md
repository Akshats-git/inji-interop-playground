# Security and privacy

The playground is a **local test lab**. It records every protocol message between issuers, wallets and
verifiers. That is what makes it useful, and it is also what makes it sensitive, because those messages carry
credentials, tokens and claim values. This page explains what the playground protects, how it does that, and what
it deliberately does not do.

## Synthetic data only

- Everything the bundle seeds is invented. That includes the *Karnataka Agriculture Department*, the *University
  of Veridonia* and holders such as "Ramesh Kumar, KA-MND-20931". The QR Lab's photos are random bytes.
- The Studio and the Run page accept any claim values. **Do not type real personal data into them.** Nothing in
  the playground is built for real identities. There is no consent flow, no access control and no audit trail.
- Credentials are signed with keys that live only in this bundle. Certify's SD-JWTs carry its default
  self-signed `www.example.com` certificate (gap G10). So nothing issued here is trusted anywhere else.

## Nothing personal at rest in plaintext

Anything that can contain claim values is sealed with **AES-256-GCM** before it reaches Postgres
([util/sealed.ts](../apps/bff/src/util/sealed.ts), [store/pg.ts](../apps/bff/src/store/pg.ts)):

| Sealed | Kept in the clear (for filtering) |
|---|---|
| Recorded request and response headers and bodies | Time, parties, method, path, HTTP status, message title, labels |
| Runs (spec with claim values, steps, results) | Status, verdict, format, wallet, verifier, mode, query, tamper preset |
| Held credentials (the Reference Wallet's) | Type, format, issuer, holder DID, dates |

- Each value gets a fresh 12-byte IV. The row id is bound in as additional authenticated data. So nobody can
  move a sealed value onto another row without being detected.
- The key is `EVENT_ENCRYPTION_KEY`. It is 32 random bytes that `./playground.sh` generates into `.env` on the
  first start (`chmod 600`). The production image refuses to start without it. If you change the key, older rows
  become unreadable. They are skipped with a single warning, and `./playground.sh reset` clears them.
- Issuer profiles and credential types are configuration (names, field labels and colours). They are stored as
  JSON.
- Certify's and Verify's own databases are **not** sealed. Certify keeps a ledger of issued credentials and
  Verify keeps submitted presentations. Both do this by design. The data is synthetic, so this is harmless.

## Retention

The playground purges runs, recorded messages and held credentials after **`RETENTION_DAYS`** (default 7, set in
`.env`). The purge runs at start-up and every hour. `./playground.sh reset` deletes everything straight away. That
includes all volumes and Certify's signing keys. It asks for confirmation first.

## Masking and reveal

The inspector shows structure, not secrets. When the API returns a recorded message
([recorder.ts](../apps/bff/src/gateway/recorder.ts), `maskSecrets` in
[core/decode.ts](../packages/core/src/decode.ts)), it replaces these values with their first and last four
characters (`eyJi●●●●eBQA`): `access_token`, `refresh_token`, `pre-authorized_code`, `tx_code`,
`authorization`, `cookie`, `set-cookie`, `code` and `response_code`.

**Reveal tokens (this computer only)** shows them in full. Use it to debug a signature or decode an access
token. The API only honours `?reveal=1` for a connection from the computer that runs the playground. That means
loopback or, in the container, the Docker bridge gateway that the host's browser arrives through
(`isThisComputer` in [exposure.ts](../apps/bff/src/gateway/exposure.ts)). A request from the LAN, from another
container or through the tunnel gets masked values.

Event summaries pushed over the live feed never carry bodies.

## Redacted reports

By default, run reports (`/api/runs/:id/report`, Markdown or JSON) replace every claim value and the `tx_code`
with `‹redacted›`. You can attach such a report to an issue or share it with a maintainer. `?redact=false` gives
you the full version.

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

1. **Only one port, and only on this computer.** Postgres, Certify and Verify publish no ports. The playground's
   port is bound to `127.0.0.1`. So in local mode nothing on the LAN can reach the API.
2. **The tunnel exposes only `/pub/*`.** In tunnel mode the public URL is a real internet address. A wallet only
   ever needs the wallet-facing gateway. So the exposure guard
   ([exposure.ts](../apps/bff/src/gateway/exposure.ts)) answers 404 for the UI, `/api/*` and `/ws` when a request
   came through the public URL. It decides that when the `Host` or any `X-Forwarded-Host` entry is the public
   host, or when the request carries Cloudflare's edge headers. A forwarded header that names a local host never
   overrides this. Until 19 Oct it did, and that let `X-Forwarded-Host: localhost` reach the API through the
   tunnel. Setting `PUBLIC_UI=true` in `.env` opts the UI and API in, so you can use the UI on a phone. It also
   exposes recorded tokens to anyone with the URL. Leave it off unless you need it, and only use it on a URL you
   control.
3. **Certify's admin APIs are never exposed.** In the reference setup they have no authentication. Anyone who
   can reach them can define credential types, mint pre-authorized offers for any claims, or revoke
   credentials. The gateway only forwards an allow-list of wallet-facing endpoints
   ([proxy.ts](../apps/bff/src/gateway/proxy.ts)) and answers everything else with `404 not_exposed`. So the
   gateway never reaches these APIs, and neither does a tunnel. The BFF calls them over the internal network.
4. **Quick-tunnel URLs are unguessable, but they are public.** Anyone who learns one can fetch issuer metadata,
   DID documents and keys. They can start a presentation request, or redeem an offer whose link they have seen.
   Stop the tunnel when you are done. `./playground.sh up` switches back to local mode.
5. **CORS.** Public documents (`/pub/issuers/*`, `/pub/contexts/*`) send `access-control-allow-origin: *`,
   because they are public by nature. The gateway answers preflights with the caller's origin and
   `allow-credentials`, which the Verify SDK's session cookie needs. It only ever forwards the allow-listed
   wallet endpoints.

## External parties

[infra/parties.yaml](../infra/parties.yaml) makes the playground call parties outside the bundle. So treat it
like code:

- **The playground only calls what the file names.** Every external call comes from a step in the file, or from
  the Reference Wallet following an offer or request that a person gave it. The playground records every one
  (sealed, like gateway traffic) with an *external party* label.
- **Step definitions stay on the server.** `/api/parties` returns names, addresses, types and health. It never
  returns the steps, because their bodies can carry an issuer's private key (the lab's comes from `${jwk:…}`) or
  a wallet login.
- **Keys and passwords go in files or the environment.** `${file:…}`, `${jwk:…}` and `${env:…}` are resolved
  when the file is read. So you can commit the YAML without the secrets. `./playground.sh up --external`
  generates the external lab's demo issuer key and certificate into `infra/external/keys/`, which is
  git-ignored. The lab's wallet login (`lab@example.org`) is a fixed demo account on a service that only exists
  on the Docker network.
- **Trust is explicit.** The Reference Verifier only accepts an external issuer's SD-JWT if its key matches a
  certificate or key that the entry lists under `trust`. Inji Verify 0.18.2 does not use that list.
- **Placeholders fail closed.** If you misspell a placeholder, the step stops with a configuration error. It
  never sends `undefined` to someone else's server.
- **Synthetic data still applies.** When you type claim values into a run with an external issuer, the
  playground sends them to that issuer to be signed. Use made-up values, as everywhere else in the playground.

## MOSIP Collab (a hosted environment)

The Collab lane connects the playground to MOSIP's public sandbox over the internet. This is what that means for
privacy:

- **Only MOSIP's public demo data goes there.** The identities are the mock UINs that MOSIP publishes for the
  sandbox (listed in [infra/parties.yaml](../infra/parties.yaml)) and the static test OTP `111111`. The
  playground never asks for a real UIN or phone number and never stores one. If you use your own self-registered
  UIN, do it only through the interactive sign-in, in your own browser at eSignet. The playground sees the
  authorization code, not your OTP.
- **Automatic sign-in is deliberate and limited.** In "automatic" mode, the Reference Wallet calls eSignet's own
  authentication API with a demo UIN and the static OTP, then exchanges the code. It exists so the matrix and
  the CI run need no person. It refuses to run for an environment without a published static OTP. The
  interactive mode is always available.
- **The `wallet-demo` private key belongs to MOSIP, and it is public.** MOSIP publishes the test OIDC client's
  PKCS12 file and password in its documentation for everyone to use. `./playground.sh` downloads it into
  `infra/collab/keys/` (git-ignored, mounted read-only). The Reference Wallet uses it to authenticate to eSignet
  with `private_key_jwt`. It identifies a shared test client, not a person. Never reuse it for anything else. Its
  registered redirect is `http://localhost:3004/redirect`. So the playground publishes port 3004 on `127.0.0.1`
  only. The redirect page serves nothing but that path, and it checks the `state` of a sign-in that the
  playground started itself.
- **The tunnel does not expose it.** In tunnel mode only `/pub/*` is public, as before. The `/api/hosted*` routes
  and port 3004 stay local.
- **Everything is recorded like any other run.** Tokens and claim values are masked, and sealed at rest. The
  credentials that Collab's issuers produce hold fictional data (a farmer, a plot of land, a driving licence).
- **The sandbox is shared.** Collab can change or reset at any time, and other participants use the same demo
  UINs. So a result is a snapshot. Every Collab finding in [gaps.md](gaps.md) is dated and names the versions I
  saw.

## No secrets in git

- `.env` holds the encryption key, the Postgres password and the mode settings. It is generated on the first
  start and listed in `.gitignore`. [.env.example](../.env.example) documents every variable, with empty
  secrets.
- The Postgres password is random for every new database volume. An existing volume that was created before
  passwords were generated keeps the old default. `./playground.sh` warns about that.
- The external lab's demo issuer key (`infra/external/keys/`) is generated on first use and git-ignored.
- `infra/collab/keys/` (MOSIP's public test client key, fetched by `./playground.sh`) is git-ignored too.
- Keystores (`*.p12`) are git-ignored and live in Docker volumes. The private keys that the Reference Wallet and
  Reference Verifier use are generated at run time.
- A few fixed values remain. They are upstream defaults for local use: Certify's PKCS12 keystore password
  `local` and Verify's keystore password `mosip`. Both keystores sit inside volumes on this machine.

## Findings this lab surfaced about the Inji stack

Testing with the tamper presets found weaknesses in Inji Verify 0.18.2 (G11, G19 and G20) and in Certify 0.14.0
(G27 and G8). On Collab's Inji Verify 1.0.0-alpha.1, G19 and G20 are fixed but G11 is not. The details
are withheld from this repository. See [gaps.md](gaps.md#responsible-disclosure). The playground's own Reference Verifier
rejects all of these presentations. That comparison is what shows the gap.

## Deploying beyond localhost

The playground is built for one person on one machine, or for a demo over a short-lived tunnel. If you host it
for others (a shared lab, MOSIP Collab), you would need at least this:

1. **Authentication and authorisation on the Studio and the API.** Today anyone who reaches `/api` can create
   issuers and types in Certify, issue credentials with any claims, read every run (decrypted) and delete data.
   Put an identity-aware proxy or OIDC login in front of the UI, `/api` and `/ws`. Give each user or team its own
   workspace. Keep `/pub/*` anonymous for wallets.
2. **Certify's admin APIs secured in Certify itself** (its OAuth-protected admin configuration), not only hidden
   by network position.
3. **Key management.** Take `EVENT_ENCRYPTION_KEY` from a secrets manager or KMS, with rotation (re-sealing old
   rows). Keep the Certify and Verify keys in an HSM (PKCS11) instead of PKCS12 files with default passwords.
4. **A real issuer identity.** That means a certificate chain for SD-JWT `x5c` that verifiers anchor in a trust
   list (G10, G11), and stable did:web hosts.
5. **Abuse limits.** Add rate limits on offer creation, runs and the QR Lab. Add body-size limits at the edge
   (the gateway accepts up to 4 MB).
6. **Data protection.** Use a shorter retention, add a privacy notice, and add a hard rule (or validation) against
   real personal data.
7. **TLS everywhere**, with HSTS on the public origin. Replace `PUBLIC_UI` with proper authentication.

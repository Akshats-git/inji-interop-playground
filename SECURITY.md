# Security

## Reporting a problem in the playground

Use GitHub's **Report a vulnerability** button (the repository's *Security* tab) so the report stays private
until it is fixed. If that is unavailable, open an issue that says only that you have a security report and
asks for a private channel; do not put details in it.

The playground is a **single-user lab**. Its API has no login and is meant to be reachable only from the
computer it runs on. Read [docs/security-privacy.md](docs/security-privacy.md) for what the tunnel mode
exposes before you host it anywhere else.

## Problems in MOSIP software

The playground tests Inji Certify, Inji Verify and MOSIP Collab. A weakness it shows in one of those belongs to
MOSIP, not to this repository. Report it to the MOSIP maintainers through their own channel
(<https://community.mosip.io>) and give them time to fix it before publishing the details. Findings that are
safe to discuss in public are listed in [docs/gaps.md](docs/gaps.md).

## Data

Use synthetic data only. Never put real identities, real credentials or real keys in an issue, a pull request
or a recorded run. MOSIP's public demo UINs and the static OTP for Collab are test data.

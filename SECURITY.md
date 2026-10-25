# Security

## Reporting a problem in the playground

Use GitHub's **Report a vulnerability** button (in the repository's *Security* tab). That keeps the report private
until it is fixed. If the button is not available, open an issue that only says you have a security report and
asks for a private channel. Please don't put details in it.

The playground is a **single-user lab**. Its API has no login. It is meant to be reached only from the computer
it runs on. Before you host it anywhere else, read [docs/security-privacy.md](docs/security-privacy.md) to see
what the tunnel mode exposes.

## Problems in MOSIP software

The playground tests Inji Certify, Inji Verify and MOSIP Collab. If it shows a weakness in one of those, the
weakness belongs to MOSIP, not to this repository. Report it to the MOSIP maintainers through their own channel
(<https://community.mosip.io>). Give them time to fix it before you publish the details. The findings that are
safe to discuss in public are listed in [docs/gaps.md](docs/gaps.md).

## Data

Use synthetic data only. Never put real identities, real credentials or real keys in an issue, a pull request
or a recorded run. MOSIP's public demo UINs and the static OTP for Collab are test data.

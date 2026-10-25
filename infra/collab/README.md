# Collab lane: MOSIP's hosted Inji sandbox

The playground runs locally and connects to **MOSIP Collab** (https://collab.mosip.net) over the internet. The
`environments` entry in [../parties.yaml](../parties.yaml) describes it:

| Collab service | What the playground does with it |
|---|---|
| Mimoto (`api.collab.mosip.net`) | Reads its issuer list, then each issuer's OpenID4VCI metadata. This is how Collab's issuers and credential types appear in the Run builder, the Wallet page and the Parties page. |
| Inji Certify issuers (`injicertify-*.collab.mosip.net`, the 1.0 line and a few 0.x ones) | The Reference Wallet collects credentials with the **authorization code flow**. That means PKCE, a signed client assertion and Certify 1.0's nonce endpoint. |
| eSignet (`esignet-mock.collab.mosip.net`) | The holder signs in. This can happen automatically (a published demo UIN and the static test OTP) or in person on eSignet's own page, which redirects to `http://localhost:3004/redirect`. |
| Inji Verify 1.0 (`injiverify.collab.mosip.net`) | A verifier that runs can choose it. It supports DCQL requests, signed request objects and results from its v2 API. |

Phones (Inji Wallet 1.0.0-alpha.1 from collab.mosip.net) get an **authorization-code offer QR code** for any
Collab issuer, with the test data shown beside it.

`keys/` is filled by `./playground.sh` with the private key of MOSIP's documented test client `wallet-demo`. The
key is downloaded from MOSIP's documentation repository (see the comment in parties.yaml). It is public test
data, but it stays out of git so the repository holds no private keys.

The playground changes nothing on Collab. It only signs in as a demo identity, collects credentials and asks
Collab's verifier to check presentations, the same as any wallet or relying party would.

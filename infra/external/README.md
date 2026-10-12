# External lab: parties that are not Inji

`./playground.sh up --external` starts three services from the **walt.id community stack** next to the Inji
stack, on the same Docker network:

| Service | Image | Role in the playground | Declared in |
|---|---|---|---|
| `waltid-issuer` | `waltid/issuer-api:1.0.0` | An external **issuer** (Library Card and University Degree, SD-JWT VC) | `issuers` in [../parties.yaml](../parties.yaml) |
| `waltid-verifier` | `waltid/verifier-api:1.0.0` | An external **verifier** (OpenID4VP, Presentation Exchange) | `verifiers` |
| `waltid-wallet` | `waltid/wallet-api:1.0.0` | An external **wallet**, driven through its API | `wallets` |

None of them is special-cased in code. The playground knows them only through `infra/parties.yaml`, which says
where they are and which HTTP calls make them issue, ask for or present a credential. Removing them from that
file removes them from the UI; adding another vendor's issuer, verifier or wallet is a matter of adding an
entry and running `./playground.sh restart`.

- `waltid/*/` holds each service's configuration (walt.id's own HOCON files, trimmed from their
  `docker-compose/` folder at tag v1.0.0). The issuer's credential types are in
  `waltid/issuer/credential-issuer-metadata.conf`.
- `keys/` is filled on first start with the demo issuer's P-256 signing key and a self-signed certificate
  (`openssl`). The certificate goes in the SD-JWT's `x5c` header, which is what Inji Verify 0.18.2 checks, and
  the parties file lists it as a trust anchor for the Reference Verifier. The files are git-ignored.
- These services are for a local lab only: their hostnames (`waltid-issuer:7002`…) exist only inside the Docker
  network, so a phone cannot reach them, and the wallet account (`lab@example.org`) is a fixed demo login.

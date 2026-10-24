import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import express from "express";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnvironmentInput } from "@playground/core";
import { redirectApp } from "../src/api/hosted.js";
import { authorizeUrl, signInAutomatically } from "../src/hosted/esignet.js";
import { claimsOf, HostedService } from "../src/hosted/service.js";
import { Recorder } from "../src/gateway/recorder.js";
import { loadPartiesFile } from "../src/parties/service.js";
import { receiveWithAuthorization } from "../src/reference/wallet/issuance.js";
import { walletHttp } from "../src/reference/wallet/http.js";
import { MemoryStore } from "../src/store/memory.js";

const INFRA = resolve(import.meta.dirname, "../../../infra");

const listen = (app: express.Express) =>
  new Promise<{ server: Server; url: string }>((done) => {
    const server = createServer(app).listen(0, "127.0.0.1", () =>
      done({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }),
    );
  });

describe("the shipped Collab environment", () => {
  it("loads from infra/parties.yaml with its verifier, OAuth client and test data", () => {
    const loaded = loadPartiesFile(join(INFRA, "parties.yaml"), {});
    expect(loaded.errors.filter((e) => e.startsWith("environments"))).toEqual([]);
    const collab = loaded.data.environments.find((e) => e.id === "collab")!;
    expect(collab.verify).toMatchObject({
      queryLanguages: ["dcql"],
      clientId: "decentralized_identifier:did:web:injiverify.collab.mosip.net:v1:verify",
    });
    expect(collab.client).toMatchObject({
      clientId: "wallet-demo",
      redirectUri: "http://localhost:3004/redirect",
    });
    expect(collab.testData.otp).toBe("111111");
    expect(collab.testData.identities[0]!.id).toBe("2154189532");
    expect(collab.mimoto?.exclude).toContain("iiit-dharwad");
  });

  it("refuses an environment that names nothing to connect to", () => {
    expect(EnvironmentInput.safeParse({ id: "empty", name: "Empty" }).success).toBe(true);
    const loaded = (() => {
      const dir = mkdtempSync(join(tmpdir(), "env-"));
      writeFileSync(join(dir, "parties.yaml"), "environments:\n  - { id: empty, name: Empty }\n");
      return loadPartiesFile(join(dir, "parties.yaml"), {});
    })();
    expect(loaded.errors.some((e) => e.includes("environment empty"))).toBe(true);
  });
});

describe("claims from issuer metadata", () => {
  it("reads OpenID4VCI 1.0 claims, draft 13 credentialSubject and SD-JWT claims", () => {
    expect(
      claimsOf({
        credential_metadata: {
          claims: [
            { path: ["UIN"], display: [{ name: "UIN" }] },
            { path: ["address", "city"], display: [{ name: "City" }] },
          ],
        },
      }).map((f) => [f.name, f.label]),
    ).toEqual([
      ["UIN", "UIN"],
      ["city", "City"],
    ]);
    expect(
      claimsOf({
        credential_definition: { credentialSubject: { fullName: { display: [{ name: "Full name" }] } } },
      })[0],
    ).toMatchObject({ name: "fullName", label: "Full name" });
    expect(claimsOf({ claims: { email: { display: [{ name: "Email" }] } } })[0]).toMatchObject({
      name: "email",
      label: "Email",
    });
  });
});

describe("eSignet sign-in", () => {
  let fake: { server: Server; url: string };
  const calls: {
    path: string;
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
  }[] = [];
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.get(
      "/v1/esignet/csrf/token",
      (_req, res) => void res.cookie("XSRF-TOKEN", "t0k").json({ token: "t0k" }),
    );
    const env = (response: unknown, errors: unknown[] = []) => ({ responseTime: "", response, errors });
    app.post("/v1/esignet/authorization/v2/oauth-details", (req, res) => {
      calls.push({ path: req.path, headers: req.headers, body: req.body.request });
      res.json(env({ transactionId: "tx1", clientName: { "@none": "wallet-demo-client" } }));
    });
    app.post(
      "/v1/esignet/authorization/send-otp",
      (req, res) => (
        calls.push({ path: req.path, headers: req.headers, body: req.body.request }),
        void res.json(env({ transactionId: "tx1" }))
      ),
    );
    app.post("/v1/esignet/authorization/v3/authenticate", (req, res) => {
      calls.push({ path: req.path, headers: req.headers, body: req.body.request });
      const ok = req.body.request.challengeList[0].challenge === "111111";
      res.json(ok ? env({ transactionId: "tx1" }) : env(null, [{ errorCode: "auth_failed" }]));
    });
    app.post(
      "/v1/esignet/authorization/auth-code",
      (req, res) => (
        calls.push({ path: req.path, headers: req.headers, body: req.body.request }),
        void res.json(env({ code: "the-code", state: calls[0]!.body.state }))
      ),
    );
    fake = await listen(app);
  });
  afterAll(() => fake.server.close());

  it("builds eSignet's login page with PKCE", () => {
    const u = new URL(
      authorizeUrl({
        authorizationEndpoint: "https://esignet.example/authorize",
        clientId: "wallet-demo",
        redirectUri: "http://localhost:3004/redirect",
        scope: "s",
        state: "st",
        nonce: "n",
        codeChallenge: "c",
        acrValues: "mosip:idp:acr:generated-code",
      }),
    );
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "wallet-demo",
      redirect_uri: "http://localhost:3004/redirect",
      scope: "s",
      state: "st",
      code_challenge: "c",
      code_challenge_method: "S256",
    });
  });

  it("signs a demo identity in the way eSignet's page does, binding each call to the transaction, and records every step", async () => {
    const store = new MemoryStore();
    const recorder = new Recorder(store);
    const p = {
      clientId: "wallet-demo",
      redirectUri: "http://localhost:3004/redirect",
      scope: "mock_identity_vc_ldp",
      state: "st-1",
      nonce: "n-1",
      codeChallenge: "cc",
      acrValues: "mosip:idp:acr:generated-code",
      individualId: "2154189532",
      otp: "111111",
    };
    expect(await signInAutomatically(fake.url, p, { recorder, runId: "run-1" })).toBe("the-code");
    expect(calls.map((c) => c.path)).toEqual([
      "/v1/esignet/authorization/v2/oauth-details",
      "/v1/esignet/authorization/send-otp",
      "/v1/esignet/authorization/v3/authenticate",
      "/v1/esignet/authorization/auth-code",
    ]);
    expect(calls[0]!.body).toMatchObject({
      clientId: "wallet-demo",
      codeChallenge: "cc",
      codeChallengeMethod: "S256",
    });
    expect(calls[1]!.headers["oauth-details-key"]).toBe("tx1");
    expect(calls[1]!.headers["oauth-details-hash"]).toBe(
      createHash("sha256")
        .update(JSON.stringify({ transactionId: "tx1", clientName: { "@none": "wallet-demo-client" } }))
        .digest("base64url"),
    );
    expect(calls[1]!.headers["x-xsrf-token"]).toBe("t0k");
    const events = await store.listEvents({ runId: "run-1" });
    expect(events.map((e) => e.title)).toEqual([
      "eSignet: CSRF token",
      "eSignet: start login (authorization request)",
      "eSignet: send OTP",
      "eSignet: sign in with the OTP",
      "eSignet: authorization code",
    ]);
    expect(events.every((e) => e.to === "esignet" && e.labels.includes("hosted Inji"))).toBe(true);
  });

  it("says what eSignet refused", async () => {
    await expect(
      signInAutomatically(
        fake.url,
        {
          clientId: "c",
          redirectUri: "http://x/r",
          scope: "s",
          state: "s2",
          nonce: "n",
          codeChallenge: "c",
          acrValues: "a",
          individualId: "1",
          otp: "000000",
        },
        {},
      ),
    ).rejects.toThrow(/auth_failed \(the identity or OTP was not accepted\)/);
  });
});

describe("authorization code issuance (OpenID4VCI 1.0)", () => {
  let fake: { server: Server; url: string };
  let seen: { token?: Record<string, string>; credential?: Record<string, unknown>; nonce?: number } = {};
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateJwk = privateKey.export({ format: "jwk" }) as JWK;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    const base = () => fake.url;
    app.get(
      "/.well-known/openid-credential-issuer",
      (_req, res) =>
        void res.json({
          credential_issuer: base(),
          authorization_servers: [base()],
          credential_endpoint: `${base()}/credential`,
          nonce_endpoint: `${base()}/nonce`,
          credential_configurations_supported: {
            Mock: {
              format: "ldp_vc",
              scope: "mock_scope",
              cryptographic_binding_methods_supported: ["did:key"],
              proof_types_supported: { jwt: { proof_signing_alg_values_supported: ["Ed25519"] } },
              credential_definition: { type: ["VerifiableCredential", "Mock"] },
            },
          },
        }),
    );
    app.get(
      "/.well-known/oauth-authorization-server",
      (_req, res) =>
        void res.json({ token_endpoint: `${base()}/token`, authorization_endpoint: `${base()}/authorize` }),
    );
    app.post(
      "/token",
      (req, res) => (
        (seen.token = req.body),
        void res.json({ access_token: "at", token_type: "Bearer", c_nonce: "stale" })
      ),
    );
    app.post(
      "/nonce",
      (_req, res) => ((seen.nonce = (seen.nonce ?? 0) + 1), void res.json({ c_nonce: "fresh" })),
    );
    app.post(
      "/credential",
      (req, res) => (
        (seen.credential = req.body),
        void res.json({ credentials: [{ credential: { type: ["VerifiableCredential", "Mock"] } }] })
      ),
    );
    fake = await listen(app);
  });
  afterAll(() => fake.server.close());

  it("signs in with PKCE, authenticates with private_key_jwt, asks the nonce endpoint and sends a 1.0 request", async () => {
    seen = {};
    let challenge = "";
    const http = walletHttp({
      publicBaseUrl: "http://playground.localhost:1",
      selfUrl: "http://127.0.0.1:1",
    });
    const got = await receiveWithAuthorization(http, {
      credentialIssuer: fake.url,
      configId: "Mock",
      client: { clientId: "wallet-demo", redirectUri: "http://localhost:3004/redirect", privateJwk },
      signIn: async (p) => {
        expect(p).toMatchObject({ scope: "mock_scope", authorizationEndpoint: `${fake.url}/authorize` });
        challenge = p.codeChallenge;
        return "code-1";
      },
    });
    expect(got.credential).toEqual({ type: ["VerifiableCredential", "Mock"] });
    // PKCE: the verifier the wallet sends hashes to the challenge it showed eSignet.
    expect(createHash("sha256").update(seen.token!.code_verifier!).digest("base64url")).toBe(challenge);
    expect(seen.token).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
      client_id: "wallet-demo",
      redirect_uri: "http://localhost:3004/redirect",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    });
    const assertion = await jwtVerify(
      seen.token!.client_assertion!,
      await importJWK({ kty: privateJwk.kty, n: privateJwk.n, e: privateJwk.e }, "RS256"),
      { audience: `${fake.url}/token` },
    );
    expect(assertion.payload).toMatchObject({ iss: "wallet-demo", sub: "wallet-demo" });
    // 1.0: a fresh c_nonce from the nonce endpoint, credential_configuration_id and proofs.
    expect(seen.nonce).toBe(1);
    expect(Object.keys(seen.credential!)).toEqual(["credential_configuration_id", "proofs"]);
    const proof = (seen.credential!.proofs as { jwt: string[] }).jwt[0]!;
    expect(decodeJwt(proof)).toMatchObject({ nonce: "fresh", aud: fake.url });
    // The issuer lists "Ed25519" rather than "EdDSA", so the proof uses that name.
    expect(decodeProtectedHeader(proof)).toMatchObject({ alg: "Ed25519", typ: "openid4vci-proof+jwt" });
  });
});

describe("hosted environment discovery", () => {
  let fake: { server: Server; url: string };
  beforeAll(async () => {
    const app = express();
    const base = () => fake.url;
    app.get(
      "/v1/mimoto/issuers",
      (_req, res) =>
        void res.json({
          response: {
            issuers: [
              // Listed with a stale metadata URL, as some issuers are on Collab today.
              {
                issuer_id: "Stale",
                display: [{ name: "Stale Issuer" }],
                protocol: "OpenId4VCI",
                enabled: "true",
                credential_issuer_host: `${base()}/stale`,
                wellknown_endpoint: `${base()}/stale/v1/certify/issuance/.well-known/openid-credential-issuer`,
              },
              {
                issuer_id: "Skipped",
                display: [{ name: "Skipped" }],
                protocol: "OpenId4VCI",
                enabled: "true",
                credential_issuer_host: `${base()}/skipped`,
              },
            ],
          },
        }),
    );
    const meta = (path: string, as: string) => ({
      credential_issuer: `${base()}${path}`,
      authorization_servers: [as],
      nonce_endpoint: `${base()}${path}/nonce`,
      credential_endpoint: `${base()}${path}/credential`,
      credential_configurations_supported: {
        T: {
          format: "dc+sd-jwt",
          vct: "T",
          scope: "t",
          credential_metadata: {
            display: [{ name: "Test card" }],
            claims: [{ path: ["name"], display: [{ name: "Name" }] }],
          },
        },
      },
    });
    app.get(
      "/stale/.well-known/openid-credential-issuer",
      (_req, res) => void res.json(meta("/stale", "https://esignet.example")),
    );
    app.get(
      "/named/.well-known/openid-credential-issuer",
      (_req, res) => void res.json(meta("/named", "https://other.example")),
    );
    fake = await listen(app);
  });
  afterAll(() => fake.server.close());

  it("finds issuers through Mimoto and the parties file, falls back to the spec location, and knows where the wallet can sign in", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hosted-"));
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(join(dir, "client.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
    const env = EnvironmentInput.parse({
      id: "lab",
      name: "Lab",
      mimoto: { url: fake.url, exclude: ["Skipped"] },
      issuers: [{ id: "named", name: "Named Issuer", credentialIssuer: `${fake.url}/named` }],
      verify: { url: "https://verify.example/v1/verify", clientId: "did:web:verify.example" },
      client: {
        clientId: "c",
        redirectUri: "http://localhost:3004/redirect",
        privateKeyFile: "client.pem",
        authorizationServers: ["https://esignet.example"],
      },
      testData: { otp: "111111", identities: [{ id: "1", label: "Demo" }] },
    });
    const hosted = new HostedService([env], dir);
    await hosted.refresh();
    const issuers = hosted.issuers("lab");
    expect(issuers.map((i) => i.id)).toEqual(["named", "Stale"]);
    const stale = issuers.find((i) => i.id === "Stale")!;
    expect(stale.note).toMatch(/OpenID4VCI location .* works/);
    expect(stale.protocol).toBe("1.0");
    const types = hosted.catalog();
    expect(types.find((t) => t.issuerId === "Stale")).toMatchObject({
      id: "hosted:lab/Stale/T",
      format: "dc+sd-jwt",
      displayName: "Test card (SD-JWT)",
      canIssue: true,
      hosted: { autoLogin: true, scope: "t" },
    });
    // The wallet's client is registered at esignet.example only.
    expect(types.find((t) => t.issuerId === "named")).toMatchObject({
      canIssue: false,
      hosted: { autoLogin: false },
    });
    expect(hosted.verifiers()[0]).toMatchObject({ id: "lab-verify", origin: "hosted", accepts: ["dcql"] });
    expect(hosted.partyOf("https://esignet.example/v1/esignet/oauth/v2/token")).toBe("esignet");
    expect(hosted.partyOf("https://verify.example/v1/verify/v2/vp-request")).toBe("hosted-verify");
    expect(hosted.partyOf("https://unrelated.example/")).toBeUndefined();

    // A person signing in: eSignet's redirect hands the code to the waiting sign-in.
    const { url, code } = hosted.startInteractive("lab", {
      authorizationServer: "https://esignet.example",
      authorizationEndpoint: "https://esignet.example/authorize",
      scope: "t",
      state: "state-9",
      nonce: "n",
      codeChallenge: "c",
    });
    expect(new URL(url).searchParams.get("state")).toBe("state-9");
    const redirect = await listen(redirectApp(hosted));
    const unknown = await fetch(`${redirect.url}/redirect?state=nope&code=x`);
    expect(unknown.status).toBe(400);
    const ok = await fetch(`${redirect.url}/redirect?state=state-9&code=the-code`);
    expect(ok.status).toBe(200);
    await expect(code).resolves.toBe("the-code");
    redirect.server.close();
  });
});

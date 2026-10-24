import type { Party, TamperPreset } from "@playground/core";
import type { Recorder } from "../../gateway/recorder.js";
import type { Store, HeldCredential } from "../../store/types.js";
import { now, uuid } from "../../util/ids.js";
import { resolveLocalDid } from "../keys.js";
import { walletHttp } from "./http.js";
import {
  receiveOffer,
  receiveWithAuthorization,
  type ReceivedCredential,
  type SignIn,
  type WalletClient,
} from "./issuance.js";
import { present, resolveRequest, type WalletCredential } from "./presentation.js";

interface RawHeld {
  credential: unknown;
  holder: WalletCredential["holder"];
}

/** The Reference Wallet as a service: keeps credentials (sealed at rest) and answers offers and requests. */
export class ReferenceWallet {
  /** Names hosted Inji parties for the inspector (set once the hosted environments are known). */
  partyOf?: (url: string) => Party | undefined;

  constructor(
    private readonly store: Store,
    private readonly urls: { publicBaseUrl: () => string; selfUrl: string },
    private readonly recorder?: Recorder,
  ) {}

  private http(runId?: string | null) {
    return walletHttp({
      publicBaseUrl: this.urls.publicBaseUrl(),
      selfUrl: this.urls.selfUrl,
      runId,
      recorder: this.recorder,
      partyOf: this.partyOf,
    });
  }

  /** did:web over HTTPS, with a plain-HTTP fallback for *.localhost so local runs work without a tunnel. */
  async resolveDidWeb(did: string, runId?: string | null): Promise<Record<string, unknown>> {
    const local = resolveLocalDid(did);
    if (local) return local;
    if (!did.startsWith("did:web:")) throw new Error(`Unsupported DID method: ${did.split(":")[1]}`);
    const parts = did.slice(8).split(":").map(decodeURIComponent);
    const host = parts.shift()!;
    const path = parts.length ? `/${parts.join("/")}/did.json` : "/.well-known/did.json";
    const scheme = /(^|\.)localhost(:\d+)?$/.test(host) ? "http" : "https";
    return (await this.http(runId).getJson(`${scheme}://${host}${path}`)) as Record<string, unknown>;
  }

  async receive(offerUri: string, opts: { txCode?: string; runId?: string | null; typeId?: string } = {}) {
    return this.keep(await receiveOffer(this.http(opts.runId), offerUri, { txCode: opts.txCode }), opts);
  }

  /** Authorization code issuance: the wallet signs the holder in (through `signIn`) and collects the credential. */
  async receiveAuthorized(o: {
    credentialIssuer: string;
    configId: string;
    client: WalletClient;
    signIn: (p: SignIn) => Promise<string>;
    runId?: string | null;
    typeId?: string;
  }) {
    const got = await receiveWithAuthorization(this.http(o.runId), {
      credentialIssuer: o.credentialIssuer,
      configId: o.configId,
      client: o.client,
      signIn: o.signIn,
    });
    return this.keep(got, o);
  }

  private async keep(got: ReceivedCredential, opts: { runId?: string | null; typeId?: string }) {
    const held: HeldCredential = {
      id: uuid(),
      createdAt: now(),
      configId: got.configId,
      typeId: opts.typeId,
      format: got.format,
      issuer: got.issuer,
      holder: got.holder.did,
      title: got.title,
      runId: opts.runId ?? undefined,
      raw: {
        credential: got.credential,
        holder: { kind: got.holder.kind, privateJwk: got.holder.privateJwk, publicJwk: got.holder.publicJwk },
      } satisfies RawHeld,
    };
    await this.store.putHeld(held);
    return { held, credential: got.credential };
  }

  async walletCredentials(onlyId?: string): Promise<WalletCredential[]> {
    const ids = onlyId ? [onlyId] : (await this.store.listHeld()).map((h) => h.id);
    const out: WalletCredential[] = [];
    for (const id of ids) {
      const h = await this.store.getHeld(id);
      if (!h) continue;
      const raw = h.raw as RawHeld;
      out.push({ id: h.id, format: h.format, credential: raw.credential, holder: raw.holder });
    }
    return out;
  }

  async present(
    requestUri: string,
    opts: { heldId?: string; tamper?: TamperPreset; runId?: string | null } = {},
  ) {
    const http = this.http(opts.runId);
    const req = await resolveRequest(http, requestUri, (did) => this.resolveDidWeb(did, opts.runId));
    const held = await this.walletCredentials(opts.heldId);
    return present(http, req, held, opts.tamper ?? "none");
  }
}

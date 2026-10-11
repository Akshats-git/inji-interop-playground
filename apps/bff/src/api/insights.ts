/**
 * Read-only insight endpoints: system status, the interop matrix, capabilities (claimed vs proven) and the
 * QR Lab ("QR requirements and limits", measured instead of guessed).
 */
import { randomBytes } from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import * as pixelpass from "@injistack/pixelpass";
import { LDP_SUITES, signingAlgOf, type Run } from "@playground/core";
import type { Config } from "../config.js";
import type { CertifyClient } from "../inji/certify.js";
import type { Store } from "../store/types.js";
import { call } from "../util/http.js";
import { VERSIONS } from "../runs/orchestrator.js";
import { ApiError, h } from "./errors.js";

/** Documented limits the QR Lab compares against. */
export const QR_LIMITS = [
  { id: "certify-claim169", label: "Certify Claim 169 QR (issuer-side cap)", maxVersion: 23, source: "Inji Certify docs: Issuing VC with QR code" },
  { id: "verify-scan", label: "Inji Verify camera scan", maxVersion: 27, source: "Inji Verify docs: Features" },
  { id: "verify-upload", label: "Inji Verify image upload", maxVersion: 32, source: "Inji Verify docs: Features" },
  { id: "qr-max", label: "QR standard maximum", maxVersion: 40, source: "ISO/IEC 18004" },
];

const EC = ["L", "M", "Q", "H"] as const;

function qrVersion(text: string, ec: (typeof EC)[number]): number | null {
  try {
    return QRCode.create(text, { errorCorrectionLevel: ec }).version;
  } catch {
    return null; // too large for any QR version
  }
}

export async function measureQr(payload: string) {
  const compressed: string = pixelpass.generateQRData(payload);
  const versions = Object.fromEntries(EC.map((ec) => [ec, { raw: qrVersion(payload, ec), pixelpass: qrVersion(compressed, ec) }]));
  const best = versions.L!.pixelpass;
  return {
    rawBytes: Buffer.byteLength(payload),
    pixelpassChars: compressed.length,
    ratio: Number((compressed.length / Buffer.byteLength(payload)).toFixed(2)),
    versions,
    limits: QR_LIMITS.map((l) => ({ ...l, fits: best !== null && best <= l.maxVersion })),
    qrPng: best !== null ? await QRCode.toDataURL(compressed, { errorCorrectionLevel: "L", margin: 2, scale: 4 }) : null,
  };
}

export function insightsApi(config: Config, store: Store, certify: CertifyClient) {
  const r = express.Router();

  r.get("/status", h(async (_req, res) => {
    const [certifyUp, verifyUp] = await Promise.all([
      certify.health(),
      call(`${config.verifyUrl}/v1/verify/actuator/health`, { timeoutMs: 3000 }).then(() => true).catch(() => false),
    ]);
    const https = config.publicBaseUrl.startsWith("https://");
    res.json({
      publicBaseUrl: config.publicBaseUrl,
      mode: https ? "public" : "local",
      phoneReady: https,
      identifiers: https ? "did:web" : "URL keys (did:web needs HTTPS)",
      services: { certify: certifyUp, verify: verifyUp },
      versions: VERSIONS,
      retentionDays: config.retentionDays,
    });
  }));

  /** Latest run for each combination, the shape the matrix page renders. */
  r.get("/matrix", h(async (_req, res) => {
    const runs = await store.listRuns({ limit: 500 });
    const latest = new Map<string, Run>();
    for (const run of runs) {
      if (run.status === "running" || run.status === "waiting") continue;
      const key = [run.labels.typeName, run.labels.format, run.spec.wallet, run.spec.verifier, run.spec.mode, run.spec.query, run.spec.tamper].join("|");
      if (!latest.has(key)) latest.set(key, run);
    }
    res.json([...latest.values()].map((run) => ({ key: run.id, run })));
  }));

  r.get("/capabilities", h(async (_req, res) => {
    const meta = await certify.metadata().catch(() => undefined);
    const as = await certify.authServerMetadata().catch(() => undefined);
    const configs = Object.entries(meta?.credential_configurations_supported ?? {});
    const claimed = {
      issuer: {
        name: "Inji Certify 0.14.0",
        formats: [...new Set(configs.map(([, c]) => String(c.format)))],
        signingAlgorithms: Object.entries(LDP_SUITES).map(([suite, alg]) => ({ suite, alg })),
        sdJwtAlgorithms: ["ES256", "EdDSA", "RS256", "ES256K"],
        bindingMethods: [...new Set(configs.flatMap(([, c]) => (c.cryptographic_binding_methods_supported as string[]) ?? []))],
        proofTypes: [...new Set(configs.flatMap(([, c]) => Object.entries((c.proof_types_supported as Record<string, { proof_signing_alg_values_supported?: string[] }>) ?? {}).map(([k, v]) => `${k} (${(v.proof_signing_alg_values_supported ?? []).join(", ")})`)))],
        grantTypes: (as?.grant_types_supported as string[]) ?? [],
        protocol: "OpenID4VCI draft 13 (+ /vd11, /vd12 endpoints)",
        configurations: configs.length,
      },
      verifier: {
        name: "Inji Verify 0.18.2",
        formats: ["ldp_vc (VCDM 1.1 and 2.0)", "vc+sd-jwt"],
        queryLanguages: ["Presentation Exchange"],
        signatureSuites: ["Ed25519Signature2018", "Ed25519Signature2020", "RsaSignature2018", "EcdsaSecp256r1Signature2019"],
        didMethods: ["did:web", "did:key", "did:jwk", "https:// key URLs"],
        qr: "PixelPass (CBOR + zlib + base45); scan ≤ v27, upload ≤ v32",
      },
    };
    // Proven = what runs actually showed, per verifier × format × proof.
    const runs = (await store.listRuns({ limit: 500 })).filter((x) => x.status === "completed" && x.spec.tamper === "none" && x.result);
    const proven = new Map<string, { verifier: string; format: string; proof: string; mode: string; query: string; accepted: number; rejected: number; lastRun: string }>();
    for (const run of runs) {
      const key = [run.labels.verifier, run.labels.format + (run.labels.dataModel ? ` DM ${run.labels.dataModel}` : ""), run.labels.proofType, run.spec.mode, run.spec.query].join("|");
      const p = proven.get(key) ?? { verifier: run.labels.verifier, format: run.labels.format + (run.labels.dataModel ? ` (DM ${run.labels.dataModel})` : ""), proof: run.labels.proofType, mode: run.spec.mode, query: run.spec.mode === "direct-share" ? "—" : run.spec.query, accepted: 0, rejected: 0, lastRun: run.id };
      if (run.result!.verifierOutcome === "ACCEPTED") p.accepted++;
      else p.rejected++;
      proven.set(key, p);
    }
    const types = await store.listTypes();
    res.json({ claimed, proven: [...proven.values()], studioTypes: types.map((t) => ({ id: t.id, name: t.displayName, format: t.format, alg: signingAlgOf(t) })) });
  }));

  /** QR Lab: how big is this credential as a QR, raw and PixelPass-compressed, and where does it fit? */
  r.post("/qr-lab", h(async (req, res) => {
    const { heldId, credential, stripPhoto } = (req.body ?? {}) as { heldId?: string; credential?: unknown; stripPhoto?: boolean };
    let vc: unknown = credential;
    if (heldId) {
      const held = await store.getHeld(heldId);
      if (!held) throw new ApiError(404, "not_found", "No such held credential.");
      vc = (held.raw as { credential: unknown }).credential;
    }
    if (vc === undefined) throw new ApiError(400, "invalid_request", "Provide heldId or credential.");
    let payload = typeof vc === "string" ? vc : JSON.stringify(vc);
    if (stripPhoto && typeof vc === "object") {
      const copy = structuredClone(vc) as { credentialSubject?: Record<string, unknown> };
      for (const k of ["face", "photo", "image", "portrait"]) delete copy.credentialSubject?.[k];
      payload = JSON.stringify(copy);
    }
    res.json(await measureQr(payload));
  }));

  /** Same measurement for a synthetic credential carrying a face image of a given size (kB). */
  r.post("/qr-lab/synthetic", h(async (req, res) => {
    const kb = Math.max(0, Math.min(64, Number(req.body?.photoKb ?? 0)));
    const base = { "@context": ["https://www.w3.org/ns/credentials/v2"], type: ["VerifiableCredential", "KarnatakaFarmerCard"], issuer: "did:web:example.org", validFrom: new Date().toISOString(), credentialSubject: { id: "did:key:z6Mk...", fullName: "Ramesh Kumar", primaryCropType: "Ragi", district: "Mandya", ...(kb ? { face: `data:image/jpeg;base64,${randomBytes(Math.round(kb * 1024)).toString("base64")}` } : {}) }, proof: { type: "Ed25519Signature2020", created: new Date().toISOString(), proofPurpose: "assertionMethod", verificationMethod: "did:web:example.org#key-1", proofValue: "z" + "3".repeat(86) } };
    res.json(await measureQr(JSON.stringify(base)));
  }));

  r.post("/qr-lab/offer", h(async (req, res) => {
    const uri = String(req.body?.uri ?? "");
    if (!uri) throw new ApiError(400, "invalid_request", "Provide uri.");
    res.json({ chars: uri.length, versions: Object.fromEntries(EC.map((ec) => [ec, qrVersion(uri, ec)])) });
  }));

  return r;
}

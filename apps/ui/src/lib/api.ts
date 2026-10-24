import type {
  CatalogType,
  CredentialType,
  EventSummary,
  IssuerProfile,
  ProtocolEvent,
  Run,
  RunSpec,
  TestIdentity,
  VerifierInfo,
  WalletInfo,
} from "@playground/core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      body.error ?? "error",
      body.message ?? `Request failed (${res.status}).`,
      body.detail,
      body.issues,
    );
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

export type IssuerWithTypes = IssuerProfile & { types: CredentialType[] };

export interface Status {
  publicBaseUrl: string;
  mode: "local" | "public";
  phoneReady: boolean;
  identifiers: string;
  services: { certify: boolean; verify: boolean };
  versions: Record<string, string>;
  /** Client ids for Inji Verify requests: its DID (signed, by reference) and a pre-registered name (by value). */
  verifyClientIds: { signed: string | null; byValue: string };
  retentionDays: number;
  parties: { file: string | null; errors: number; configured: number; reachable: number };
  /** Hosted Inji environments (MOSIP Collab). */
  hosted: { id: string; name: string; reachable: boolean; issuers: number; types: number }[];
}

/** A hosted Inji deployment as the playground discovered it (no keys). */
export interface HostedEnvironment {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  version?: string;
  mimoto?: { url: string; ok?: boolean; detail?: string };
  refreshedAt?: string;
  issuers: {
    id: string;
    name: string;
    credentialIssuer: string;
    authorizationServer?: string;
    protocol: "1.0" | "draft 13";
    listedBy?: string;
    note?: string;
    error?: string;
    types: CatalogType[];
  }[];
  verifier?: VerifierInfo;
  client?: {
    clientId: string;
    redirectUri: string;
    authorizationServers: string[];
    ready: boolean;
    problem?: string;
  };
  testData: {
    otp?: string;
    identities: TestIdentity[];
    notes: { issuer?: string; text: string }[];
    selfRegistration?: string;
  };
}

export interface CollectJob {
  id: string;
  status: "signing-in" | "waiting-login" | "collecting" | "done" | "failed";
  loginUrl?: string;
  held?: HeldSummary;
  error?: string;
}

/** The parties registry: built-in and external wallets and verifiers, external issuers with their types. */
export interface Parties {
  file: string | null;
  loadedAt: string;
  errors: string[];
  health: Record<string, { ok: boolean; detail: string }>;
  issuers: {
    id: string;
    name: string;
    description: string;
    software?: string;
    homepage?: string;
    credentialIssuer: string;
    offerPage?: string;
    trust: { certificates: number; jwks: number; jwksUri?: string };
    types: CatalogType[];
  }[];
  verifiers: VerifierInfo[];
  wallets: (WalletInfo & { automated: boolean })[];
  environments: HostedEnvironment[];
}

export interface HeldSummary {
  id: string;
  createdAt: string;
  configId: string;
  format: string;
  issuer: string;
  holder: string;
  title: string;
  runId?: string;
}

export interface QrMeasure {
  rawBytes: number;
  pixelpassChars: number;
  ratio: number;
  versions: Record<"L" | "M" | "Q" | "H", { raw: number | null; pixelpass: number | null }>;
  limits: { id: string; label: string; maxVersion: number; source: string; fits: boolean }[];
  qrPng: string | null;
}

export interface Capabilities {
  /** What each hosted environment says about itself. */
  hosted: {
    id: string;
    name: string;
    version?: string;
    verifier?: { name: string; queryLanguages: string[]; formats: string[] };
    issuers: { name: string; protocol: string; formats: string[]; types: number; error?: string }[];
  }[];
  claimed: {
    issuer: {
      name: string;
      formats: string[];
      signingAlgorithms: { suite: string; alg: string }[];
      sdJwtAlgorithms: string[];
      bindingMethods: string[];
      proofTypes: string[];
      grantTypes: string[];
      protocol: string;
      configurations: number;
    };
    verifier: {
      name: string;
      formats: string[];
      queryLanguages: string[];
      signatureSuites: string[];
      didMethods: string[];
      qr: string;
    };
  };
  proven: {
    verifier: string;
    format: string;
    proof: string;
    mode: string;
    query: string;
    accepted: number;
    rejected: number;
    lastRun: string;
  }[];
}

export const api = {
  status: () => request<Status>("/status"),
  issuers: () => request<IssuerWithTypes[]>("/issuers"),
  createIssuer: (body: unknown) => post<IssuerProfile>("/issuers", body),
  types: () => request<CredentialType[]>("/types"),
  previewType: (body: unknown) =>
    post<{ configId: string; certifyConfiguration: unknown; template: string; context?: unknown }>(
      "/types/preview",
      body,
    ),
  createType: (body: unknown) => post<{ type: CredentialType; advertised: boolean }>("/types", body),
  deleteType: (id: string) => request<void>(`/types/${id}`, { method: "DELETE" }),
  createOffer: (typeId: string, body: unknown) => post<{ offerUri: string }>(`/types/${typeId}/offers`, body),
  studioOptions: () =>
    request<{ ldpSuites: { suite: string; alg: string }[]; sdJwtAlgs: string[] }>("/studio/options"),

  runs: (q = "") => request<Run[]>(`/runs${q}`),
  run: (id: string) => request<Run>(`/runs/${id}`),
  startRun: (spec: Partial<RunSpec>) => post<Run>("/runs", spec),
  cancelRun: (id: string) => request<void>(`/runs/${id}/cancel`, { method: "POST" }),
  runEvents: (id: string) => request<EventSummary[]>(`/runs/${id}/events`),
  events: (q = "") => request<EventSummary[]>(`/events${q}`),
  event: (id: string, reveal = false) => request<ProtocolEvent>(`/events/${id}${reveal ? "?reveal=1" : ""}`),

  held: () => request<HeldSummary[]>("/wallet/credentials"),
  heldOne: (id: string) =>
    request<HeldSummary & { credential: unknown; claims: Record<string, unknown> }>(
      `/wallet/credentials/${id}`,
    ),
  deleteHeld: (id: string) => request<void>(`/wallet/credentials/${id}`, { method: "DELETE" }),
  receiveOffer: (offerUri: string, txCode?: string) =>
    post<HeldSummary>("/wallet/receive", { offerUri, txCode }),
  presentTo: (requestUri: string, heldId?: string, tamper?: string) =>
    post<{
      status: number;
      verifierResponse: unknown;
      disclosed?: string[];
      withheld?: string[];
      matches: { queryId: string; credentialId: string; explanation: string }[];
      request: { clientId: string; transport: string; language: string; signed?: unknown };
    }>("/wallet/present", { requestUri, heldId, tamper }),

  parties: () => request<Parties>("/parties"),
  catalog: () => request<CatalogType[]>("/catalog"),
  externalOffer: (
    issuer: string,
    type: string,
    body: { claims?: Record<string, unknown>; txCode?: string } = {},
  ) => post<{ offerUri: string }>(`/parties/issuers/${issuer}/types/${type}/offers`, body),
  runInput: (id: string, body: { offerUri?: string; confirm?: boolean }) =>
    post<void>(`/runs/${id}/input`, body),

  hosted: () =>
    request<{ environments: HostedEnvironment[]; health: Record<string, { ok: boolean; detail: string }> }>(
      "/hosted",
    ),
  refreshHosted: () => post<{ environments: HostedEnvironment[] }>("/hosted/refresh", {}),
  collectHosted: (typeId: string, login: { mode: "auto" | "interactive"; individualId?: string }) =>
    post<CollectJob>("/hosted/collect", { typeId, login }),
  collectJob: (id: string) => request<CollectJob>(`/hosted/collect/${id}`),

  matrix: () => request<{ key: string; run: Run }[]>("/matrix"),
  capabilities: () => request<Capabilities>("/capabilities"),
  qrLab: (body: { heldId?: string; credential?: unknown }) => post<QrMeasure>("/qr-lab", body),
  qrSynthetic: (photoKb: number) => post<QrMeasure>("/qr-lab/synthetic", { photoKb }),
};

export const reportUrl = (id: string, format: "md" | "json" = "md", redact = true) =>
  `/api/runs/${id}/report?format=${format}&redact=${redact}`;

import type { CredentialType, EventSummary, IssuerProfile, ProtocolEvent, Run } from "@playground/core";

/** A credential held by the Reference Wallet. `raw` is the credential exactly as the issuer returned it. */
export interface HeldCredential {
  id: string;
  createdAt: string;
  configId: string;
  typeId?: string;
  format: string;
  issuer: string;
  /** did:key / did:jwk the credential is bound to. */
  holder: string;
  title: string;
  raw: unknown;
  runId?: string;
}

export type HeldSummary = Omit<HeldCredential, "raw">;

export interface RunFilter {
  limit?: number;
  status?: string;
  verdict?: string;
  format?: string;
  wallet?: string;
  verifier?: string;
}

export interface Store {
  init(): Promise<void>;
  close(): Promise<void>;

  listIssuers(): Promise<IssuerProfile[]>;
  getIssuer(slug: string): Promise<IssuerProfile | undefined>;
  putIssuer(p: IssuerProfile): Promise<void>;
  deleteIssuer(slug: string): Promise<void>;

  listTypes(issuerSlug?: string): Promise<CredentialType[]>;
  getType(id: string): Promise<CredentialType | undefined>;
  putType(t: CredentialType): Promise<void>;
  deleteType(id: string): Promise<void>;

  putRun(r: Run): Promise<void>;
  getRun(id: string): Promise<Run | undefined>;
  listRuns(f?: RunFilter): Promise<Run[]>;
  deleteRun(id: string): Promise<void>;

  /** Assigns `seq` (per run, or global for unattributed traffic) and persists the sealed payload. */
  addEvent(e: Omit<ProtocolEvent, "seq">): Promise<ProtocolEvent>;
  listEvents(q: { runId?: string | null; limit?: number; sinceSeq?: number }): Promise<EventSummary[]>;
  getEvent(id: string): Promise<ProtocolEvent | undefined>;
  attachEvents(ids: string[], runId: string): Promise<void>;

  putHeld(h: HeldCredential): Promise<void>;
  listHeld(): Promise<HeldSummary[]>;
  getHeld(id: string): Promise<HeldCredential | undefined>;
  deleteHeld(id: string): Promise<void>;

  /** Retention: delete runs, events and held credentials older than the cutoff. */
  purge(before: Date): Promise<{ runs: number; events: number; held: number }>;
}

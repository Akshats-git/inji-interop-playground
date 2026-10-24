import type { CredentialType, EventSummary, IssuerProfile, ProtocolEvent, Run } from "@playground/core";
import type { HeldCredential, RunFilter, Store } from "./types.js";

/** In-memory store for tests and quick local runs without Postgres. */
export class MemoryStore implements Store {
  private issuers = new Map<string, IssuerProfile>();
  private types = new Map<string, CredentialType>();
  private runs = new Map<string, Run>();
  private events: ProtocolEvent[] = [];
  private held = new Map<string, HeldCredential>();
  private seqs = new Map<string, number>();

  async init() {}
  async close() {}

  async listIssuers() {
    return [...this.issuers.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getIssuer(slug: string) {
    return this.issuers.get(slug);
  }
  async putIssuer(p: IssuerProfile) {
    this.issuers.set(p.slug, p);
  }
  async deleteIssuer(slug: string) {
    this.issuers.delete(slug);
  }

  async listTypes(issuerSlug?: string) {
    return [...this.types.values()]
      .filter((t) => !issuerSlug || t.issuerSlug === issuerSlug)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getType(id: string) {
    return this.types.get(id) ?? [...this.types.values()].find((t) => t.configId === id);
  }
  async putType(t: CredentialType) {
    this.types.set(t.id, t);
  }
  async deleteType(id: string) {
    this.types.delete(id);
  }

  async putRun(r: Run) {
    this.runs.set(r.id, structuredClone(r));
  }
  async getRun(id: string) {
    const r = this.runs.get(id);
    return r && structuredClone(r);
  }
  async listRuns(f: RunFilter = {}) {
    return [...this.runs.values()]
      .filter(
        (r) =>
          (!f.status || r.status === f.status) &&
          (!f.verdict || r.result?.verdict === f.verdict) &&
          (!f.format || r.labels.format === f.format) &&
          (!f.wallet || r.spec.wallet === f.wallet) &&
          (!f.verifier || r.spec.verifier === f.verifier),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, f.limit ?? 200)
      .map((r) => structuredClone(r));
  }
  async deleteRun(id: string) {
    this.runs.delete(id);
    this.events = this.events.filter((e) => e.runId !== id);
  }

  async addEvent(e: Omit<ProtocolEvent, "seq">) {
    const key = e.runId ?? "";
    const seq = (this.seqs.get(key) ?? 0) + 1;
    this.seqs.set(key, seq);
    const full = { ...e, seq };
    this.events.push(full);
    return full;
  }
  async listEvents(q: { runId?: string | null; limit?: number; sinceSeq?: number }): Promise<EventSummary[]> {
    return this.events
      .filter(
        (e) =>
          (q.runId === undefined ? true : e.runId === q.runId) &&
          (q.sinceSeq === undefined || e.seq > q.sinceSeq),
      )
      .slice(-(q.limit ?? 500))
      .map(({ request: _q, response: _r, ...rest }) => rest);
  }
  async getEvent(id: string) {
    return this.events.find((e) => e.id === id);
  }
  async attachEvents(ids: string[], runId: string) {
    let seq = this.seqs.get(runId) ?? 0;
    for (const e of this.events)
      if (ids.includes(e.id) && e.runId !== runId) Object.assign(e, { runId, seq: ++seq });
    this.seqs.set(runId, seq);
  }

  async putHeld(h: HeldCredential) {
    this.held.set(h.id, h);
  }
  async listHeld() {
    return [...this.held.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ raw: _raw, ...rest }) => rest);
  }
  async getHeld(id: string) {
    return this.held.get(id);
  }
  async deleteHeld(id: string) {
    this.held.delete(id);
  }

  async purge(before: Date) {
    const cut = before.toISOString();
    const r0 = this.runs.size,
      e0 = this.events.length,
      h0 = this.held.size;
    for (const [id, r] of this.runs) if (r.createdAt < cut) this.runs.delete(id);
    this.events = this.events.filter((e) => e.at >= cut);
    for (const [id, h] of this.held) if (h.createdAt < cut) this.held.delete(id);
    return { runs: r0 - this.runs.size, events: e0 - this.events.length, held: h0 - this.held.size };
  }
}

import pg from "pg";
import type { CredentialType, EventSummary, IssuerProfile, ProtocolEvent, Run } from "@playground/core";
import type { Sealer } from "../util/sealed.js";
import type { HeldCredential, HeldSummary, RunFilter, Store } from "./types.js";

/**
 * Postgres store. Issuer profiles and credential types are configuration (no personal data) and are kept
 * as JSON. Runs, protocol payloads and held credentials can contain claim values, so their bodies are
 * sealed with AES-256-GCM; only the columns needed for filtering are stored in the clear.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS issuer_profiles (slug TEXT PRIMARY KEY, doc JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS credential_types (id TEXT PRIMARY KEY, config_id TEXT UNIQUE NOT NULL, issuer_slug TEXT NOT NULL, doc JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, verdict TEXT,
  format TEXT, wallet TEXT, verifier TEXT, mode TEXT, query TEXT, tamper TEXT,
  body BYTEA NOT NULL, iv BYTEA NOT NULL);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created_at DESC);
CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY, run_id TEXT, seq INT NOT NULL, at TIMESTAMPTZ NOT NULL, duration_ms INT NOT NULL,
  party_from TEXT NOT NULL, party_to TEXT NOT NULL, actor TEXT, method TEXT NOT NULL, path TEXT NOT NULL,
  status INT NOT NULL, title TEXT NOT NULL, phase TEXT NOT NULL, labels TEXT[] NOT NULL DEFAULT '{}',
  payload BYTEA NOT NULL, iv BYTEA NOT NULL);
CREATE INDEX IF NOT EXISTS run_events_run ON run_events (run_id, seq);
CREATE INDEX IF NOT EXISTS run_events_at ON run_events (at);
CREATE TABLE IF NOT EXISTS held_credentials (
  id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, summary JSONB NOT NULL, body BYTEA NOT NULL, iv BYTEA NOT NULL);
`;

type Row = Record<string, unknown>;

export class PgStore implements Store {
  private pool: pg.Pool;

  constructor(url: string, private readonly sealer: Sealer) {
    this.pool = new pg.Pool({ connectionString: url, max: 8 });
  }

  async init() {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.pool.query(SCHEMA);
        return;
      } catch (e) {
        if (attempt >= 30) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  async close() {
    await this.pool.end();
  }

  private q<T extends Row = Row>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(sql, params);
  }

  async listIssuers() {
    return (await this.q<{ doc: IssuerProfile }>("SELECT doc FROM issuer_profiles ORDER BY created_at")).rows.map((r) => r.doc);
  }
  async getIssuer(slug: string) {
    return (await this.q<{ doc: IssuerProfile }>("SELECT doc FROM issuer_profiles WHERE slug=$1", [slug])).rows[0]?.doc;
  }
  async putIssuer(p: IssuerProfile) {
    await this.q("INSERT INTO issuer_profiles (slug, doc, created_at) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET doc=EXCLUDED.doc", [p.slug, p, p.createdAt]);
  }
  async deleteIssuer(slug: string) {
    await this.q("DELETE FROM issuer_profiles WHERE slug=$1", [slug]);
  }

  async listTypes(issuerSlug?: string) {
    const r = issuerSlug
      ? await this.q<{ doc: CredentialType }>("SELECT doc FROM credential_types WHERE issuer_slug=$1 ORDER BY created_at", [issuerSlug])
      : await this.q<{ doc: CredentialType }>("SELECT doc FROM credential_types ORDER BY created_at");
    return r.rows.map((x) => x.doc);
  }
  async getType(id: string) {
    return (await this.q<{ doc: CredentialType }>("SELECT doc FROM credential_types WHERE id=$1 OR config_id=$1", [id])).rows[0]?.doc;
  }
  async putType(t: CredentialType) {
    await this.q(
      "INSERT INTO credential_types (id, config_id, issuer_slug, doc, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET doc=EXCLUDED.doc, config_id=EXCLUDED.config_id",
      [t.id, t.configId, t.issuerSlug, t, t.createdAt],
    );
  }
  async deleteType(id: string) {
    await this.q("DELETE FROM credential_types WHERE id=$1", [id]);
  }

  async putRun(r: Run) {
    const s = this.sealer.seal(r, r.id);
    await this.q(
      `INSERT INTO runs (id, created_at, status, verdict, format, wallet, verifier, mode, query, tamper, body, iv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, verdict=EXCLUDED.verdict, body=EXCLUDED.body, iv=EXCLUDED.iv`,
      [r.id, r.createdAt, r.status, r.result?.verdict ?? null, r.labels.format, r.spec.wallet, r.spec.verifier, r.spec.mode, r.spec.query, r.spec.tamper, s.data, s.iv],
    );
  }
  private openRun(row: { id: string; body: Buffer; iv: Buffer }) {
    return this.sealer.open<Run>({ data: row.body, iv: row.iv }, row.id);
  }
  async getRun(id: string) {
    const row = (await this.q<{ id: string; body: Buffer; iv: Buffer }>("SELECT id, body, iv FROM runs WHERE id=$1", [id])).rows[0];
    return row && this.openRun(row);
  }
  async listRuns(f: RunFilter = {}) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, v?: string) => {
      if (v) {
        params.push(v);
        where.push(`${col}=$${params.length}`);
      }
    };
    add("status", f.status);
    add("verdict", f.verdict);
    add("format", f.format);
    add("wallet", f.wallet);
    add("verifier", f.verifier);
    params.push(f.limit ?? 200);
    const rows = (await this.q<{ id: string; body: Buffer; iv: Buffer }>(`SELECT id, body, iv FROM runs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT $${params.length}`, params)).rows;
    return rows.map((r) => this.openRun(r));
  }
  async deleteRun(id: string) {
    await this.q("DELETE FROM run_events WHERE run_id=$1", [id]);
    await this.q("DELETE FROM runs WHERE id=$1", [id]);
  }

  async addEvent(e: Omit<ProtocolEvent, "seq">) {
    const s = this.sealer.seal({ request: e.request, response: e.response }, e.id);
    const r = await this.q<{ seq: number }>(
      `INSERT INTO run_events (id, run_id, seq, at, duration_ms, party_from, party_to, actor, method, path, status, title, phase, labels, payload, iv)
       VALUES ($1,$2,(SELECT COALESCE(MAX(seq),0)+1 FROM run_events WHERE run_id IS NOT DISTINCT FROM $2),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING seq`,
      [e.id, e.runId, e.at, Math.round(e.durationMs), e.from, e.to, e.actor ?? null, e.method, e.path, e.status, e.title, e.phase, e.labels, s.data, s.iv],
    );
    return { ...e, seq: r.rows[0]!.seq };
  }
  private toSummary(r: Row): EventSummary {
    return {
      id: r.id as string,
      runId: (r.run_id as string) ?? null,
      seq: r.seq as number,
      at: (r.at as Date).toISOString(),
      durationMs: r.duration_ms as number,
      from: r.party_from as EventSummary["from"],
      to: r.party_to as EventSummary["to"],
      actor: (r.actor as string) ?? undefined,
      method: r.method as string,
      path: r.path as string,
      status: r.status as number,
      title: r.title as string,
      phase: r.phase as EventSummary["phase"],
      labels: r.labels as string[],
    };
  }
  async listEvents(q: { runId?: string | null; limit?: number; sinceSeq?: number }) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.runId !== undefined) {
      params.push(q.runId);
      where.push(`run_id IS NOT DISTINCT FROM $${params.length}`);
    }
    if (q.sinceSeq !== undefined) {
      params.push(q.sinceSeq);
      where.push(`seq > $${params.length}`);
    }
    params.push(q.limit ?? 500);
    const rows = (await this.q(`SELECT * FROM (SELECT id, run_id, seq, at, duration_ms, party_from, party_to, actor, method, path, status, title, phase, labels FROM run_events ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC LIMIT $${params.length}) t ORDER BY at ASC`, params)).rows;
    return rows.map((r) => this.toSummary(r));
  }
  async getEvent(id: string) {
    const r = (await this.q("SELECT * FROM run_events WHERE id=$1", [id])).rows[0];
    if (!r) return undefined;
    const body = this.sealer.open<Pick<ProtocolEvent, "request" | "response">>({ data: r.payload as Buffer, iv: r.iv as Buffer }, id);
    return { ...this.toSummary(r), ...body };
  }
  async attachEvents(ids: string[], runId: string) {
    if (!ids.length) return;
    await this.q(
      `UPDATE run_events e SET run_id=$2, seq=n.seq FROM (
         SELECT id, (SELECT COALESCE(MAX(seq),0) FROM run_events WHERE run_id=$2) + row_number() OVER (ORDER BY at) AS seq
         FROM run_events WHERE id = ANY($1) AND run_id IS DISTINCT FROM $2) n
       WHERE e.id = n.id`,
      [ids, runId],
    );
  }

  async putHeld(h: HeldCredential) {
    const { raw, ...summary } = h;
    const s = this.sealer.seal(raw, h.id);
    await this.q("INSERT INTO held_credentials (id, created_at, summary, body, iv) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET summary=EXCLUDED.summary, body=EXCLUDED.body, iv=EXCLUDED.iv", [h.id, h.createdAt, summary, s.data, s.iv]);
  }
  async listHeld() {
    return (await this.q<{ summary: HeldSummary }>("SELECT summary FROM held_credentials ORDER BY created_at DESC")).rows.map((r) => r.summary);
  }
  async getHeld(id: string) {
    const r = (await this.q<{ summary: HeldSummary; body: Buffer; iv: Buffer }>("SELECT summary, body, iv FROM held_credentials WHERE id=$1", [id])).rows[0];
    return r && { ...r.summary, raw: this.sealer.open({ data: r.body, iv: r.iv }, id) };
  }
  async deleteHeld(id: string) {
    await this.q("DELETE FROM held_credentials WHERE id=$1", [id]);
  }

  async purge(before: Date) {
    const ev = await this.q("DELETE FROM run_events WHERE at < $1", [before]);
    const runs = await this.q("DELETE FROM runs WHERE created_at < $1", [before]);
    const held = await this.q("DELETE FROM held_credentials WHERE created_at < $1", [before]);
    return { runs: runs.rowCount ?? 0, events: ev.rowCount ?? 0, held: held.rowCount ?? 0 };
  }
}

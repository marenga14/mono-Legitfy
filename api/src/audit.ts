import { sha256Hex } from "./crypto.js";
import type { Db, Queryable } from "./db.js";

const GENESIS = "0".repeat(64);

interface Entry {
  requestId: string | null;
  institutionId: number | null;
  actor: string;
  action: string;
  detail?: unknown;
}

const hashEntry = (prev: string, e: Omit<Entry, "detail"> & { detailHash: string; createdAt: string }) =>
  sha256Hex(JSON.stringify([prev, e.requestId, e.institutionId, e.actor, e.action, e.detailHash, e.createdAt]));

/** Append-only hash chain. Details are hashed so the log itself holds no personal data. */
/** Always in a transaction: the advisory lock below only holds for one. */
export async function appendAudit(db: Db | Queryable, entry: Entry): Promise<string> {
  const write = async (tx: Queryable) => {
    await tx.query("SELECT pg_advisory_xact_lock(1)");
    const last = await tx.query<{ entry_hash: string }>("SELECT entry_hash FROM audit_log ORDER BY seq DESC LIMIT 1");
    const prev = last.rows[0]?.entry_hash ?? GENESIS;
    const createdAt = new Date().toISOString();
    const detailHash = sha256Hex(JSON.stringify(entry.detail ?? null));
    const entryHash = hashEntry(prev, { ...entry, detailHash, createdAt });
    await tx.query(
      `INSERT INTO audit_log (request_id, institution_id, actor, action, detail_hash, prev_hash, entry_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.requestId, entry.institutionId, entry.actor, entry.action, detailHash, prev, entryHash, createdAt],
    );
    return entryHash;
  };
  return "transaction" in db ? (db as Db).transaction(write) : write(db);
}

interface Row {
  request_id: string | null;
  institution_id: number | null;
  actor: string;
  action: string;
  detail_hash: string;
  prev_hash: string;
  entry_hash: string;
  created_at: string | Date;
}

/** Returns the seq of the first broken entry, or null when the whole chain is intact. */
export async function verifyAuditChain(db: Db): Promise<number | null> {
  const { rows } = await db.query<Row & { seq: number }>("SELECT * FROM audit_log ORDER BY seq");
  let prev = GENESIS;
  for (const r of rows) {
    const expected = hashEntry(prev, {
      requestId: r.request_id,
      institutionId: r.institution_id,
      actor: r.actor,
      action: r.action,
      detailHash: r.detail_hash,
      createdAt: new Date(r.created_at).toISOString(),
    });
    if (r.prev_hash !== prev || r.entry_hash !== expected) return Number(r.seq);
    prev = r.entry_hash;
  }
  return null;
}

/** The last hash of a UTC day commits to the entire log up to that point. */
export async function dailyRoot(db: Db, day: Date): Promise<string | null> {
  const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
  const { rows } = await db.query<{ entry_hash: string }>(
    "SELECT entry_hash FROM audit_log WHERE created_at < $1 ORDER BY seq DESC LIMIT 1",
    [end.toISOString()],
  );
  return rows[0]?.entry_hash ?? null;
}

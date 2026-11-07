import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  agent_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  admin TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT ''
);
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS logo_type TEXT;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS seal_style JSONB;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS seal_image_type TEXT;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS emblem_type TEXT;
CREATE TABLE IF NOT EXISTS staff (
  account TEXT PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id),
  name TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3)
);
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS admin TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id),
  requester_org TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  purpose TEXT NOT NULL,
  consent_agent BOOLEAN NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  tracking_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'received',
  level INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL DEFAULT 'normal',
  escalation_reason TEXT,
  assigned_to TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  registry_status TEXT NOT NULL DEFAULT 'unchecked',
  registry_institution TEXT,
  registry_institution_id INTEGER,
  triage_status TEXT NOT NULL DEFAULT 'not_run',
  triage JSONB,
  answer_outcome TEXT,
  answer_note TEXT,
  answered_by TEXT,
  answered_at TIMESTAMPTZ,
  receipt_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS registry_institution_id INTEGER;
CREATE INDEX IF NOT EXISTS requests_inbox ON requests (institution_id, status, due_at);
CREATE TABLE IF NOT EXISTS audit_log (
  seq BIGSERIAL PRIMARY KEY,
  request_id UUID,
  institution_id INTEGER,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id),
  owner_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS sealed BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS credentials_inst ON credentials (institution_id, created_at DESC);
CREATE TABLE IF NOT EXISTS shares (
  id UUID PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES credentials(id),
  recipient TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  shared_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY,
  institution_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  institution_type TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  official_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_position TEXT NOT NULL,
  applicant_email TEXT NOT NULL DEFAULT '',
  signatory_name TEXT NOT NULL,
  signatory_title TEXT NOT NULL,
  wallet TEXT NOT NULL,
  registration_type TEXT NOT NULL,
  mandate_type TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_mandate',
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  institution_id INTEGER,
  tracking_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_email TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS identity_document TEXT;
ALTER TABLE applications DROP COLUMN IF EXISTS identity_type;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS identity_number TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS identity_consent_at TIMESTAMPTZ;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS official_email TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS registration_number TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS institution_type TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
UPDATE institutions i SET website = a.website, phone = a.phone, official_email = a.official_email,
  registration_number = a.registration_number, institution_type = a.institution_type, country = a.country, city = a.city
  FROM applications a WHERE a.institution_id = i.id AND a.status = 'approved' AND i.registration_number = '';
CREATE TABLE IF NOT EXISTS audit_anchors (
  day INTEGER PRIMARY KEY,
  root TEXT NOT NULL,
  tx_hash TEXT,
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS institution_changes (
  id UUID PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id),
  field TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_change ON institution_changes (institution_id, field) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS applications_open_number ON applications (lower(registration_number)) WHERE status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS applications_open_wallet ON applications (wallet) WHERE status <> 'rejected';
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sponsorship_usage (
  institution_id INTEGER NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, day)
);
`;

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}
export interface Db extends Queryable {
  transaction<R>(work: (tx: Queryable) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** Local development and tests. `dataDir` undefined means in-memory. One process only. */
export async function openDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.exec(SCHEMA);
  return {
    query: (sql, params) => lite.query(sql, params as any[]),
    exec: (sql) => lite.exec(sql),
    transaction: (work) => lite.transaction((tx) => work({ query: (sql, params) => tx.query(sql, params as any[]), exec: (sql) => tx.exec(sql) })) as Promise<any>,
    close: () => lite.close(),
  };
}

/** Production. */
export async function openPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle connection can drop when Postgres restarts. The pool replaces it, and this keeps the process up.
  pool.on("error", (error) => console.error("idle database connection lost", error));
  await pool.query(SCHEMA);
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as Promise<any>,
    exec: (sql) => pool.query(sql),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({ query: (sql, params) => client.query(sql, params as any[]) as Promise<any>, exec: (sql) => client.query(sql) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

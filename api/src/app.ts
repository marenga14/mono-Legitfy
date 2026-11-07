import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { getAddress, isAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import type { Triage, Triager } from "./agent.js";
import { appendAudit } from "./audit.js";
import { fieldName, renderEmail, type EmailData, type EmailKind, type Locale } from "./emails.js";
import type { Mailer } from "./mail.js";
import { credentialIdFor, type Chain, type MemberRole } from "./chain.js";
import { decryptFile, encryptFile, sha256Hex } from "./crypto.js";
import type { Db } from "./db.js";
import { dueAt, escalateForSla, routeAfterTriage } from "./escalation.js";
import { evaluateSponsorship } from "./sponsorship.js";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_LOGO_BYTES = 1024 * 1024;
const SESSION_SECONDS = 3600;
const NONCE_SECONDS = 300;

export interface Deps {
  db: Db;
  chain: Chain;
  triager: Triager | null;
  sessionSecret: string;
  fileMasterKey: string;
  dataDir: string;
  webOrigin: string;
  registry: Address;
  dailySponsorQuota: number;
  /** What applies until the platform admin saves network details. */
  network: { name: string; chainId: number; rpcUrl: string; explorerUrl: string };
  /** Only when a reverse proxy we run sets x-forwarded-for. Otherwise a client could forge it. */
  trustProxy?: boolean;
  /** Leave out to send no email. */
  mailer?: Mailer;
  /** Whether the daily audit fingerprint is being written to the chain. */
  anchoring?: boolean;
  /** Signs an approved UserOperation; absent until a paymaster is deployed. */
  signSponsorship?: (op: Record<string, unknown>) => Promise<{ paymasterAndData: Hex; validUntil: number }>;
}

interface Session {
  account: Address;
  institutionId: number;
  role: MemberRole;
  level: number;
}
const CERTIFICATE_CODE = /^[A-Z]{2,4}-\d{2}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
const ON_CHAIN_HASH = /^0x[0-9a-f]{64}$/;
const INSTITUTION_TYPES = ["university", "college", "school", "professional_body", "government", "other"] as const;
const ContactForm = z.object({
  website: z.string().trim().max(200).regex(/^(https?:\/\/.+)?$/),
  phone: z.string().trim().min(5).max(40),
  officialEmail: z.email().max(254),
});
/** Details an institution can only change with evidence. The name isn't here: the registry can't rename. */
const ChangeForm = z.object({
  field: z.enum(["registration_number", "institution_type", "country", "city"]),
  value: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(3).max(1000),
}).refine((c) => c.field !== "institution_type" || (INSTITUTION_TYPES as readonly string[]).includes(c.value));
/** Kept in step with web/src/lib/seal.ts, which draws them. */
const SEAL_DESIGNS = ["rosette", "classic", "beaded", "milled", "octagon", "plaque"] as const;
const SEAL_COLOURS = ["violet", "navy", "blue", "green", "red"] as const;
const SealForm = z.object({
  design: z.enum(SEAL_DESIGNS),
  colour: z.enum(SEAL_COLOURS),
  source: z.enum(["template", "upload"]).default("template"),
  centre: z.enum(["initials", "emblem"]).default("initials"),
  initials: z.string().trim().regex(/^[A-Za-z0-9]{0,4}$/).default(""),
  topText: z.string().trim().max(70).default(""),
  bottomText: z.string().trim().max(40).default(""),
  poBox: z.string().trim().max(40).default(""),
  showDate: z.boolean().default(false),
  qr: z.enum(["inside", "separate", "none"]).default("inside"),
  position: z.enum(["bottom-right", "bottom-left", "top-right", "top-left"]).default("bottom-right"),
  arrangement: z.enum(["opposite", "horizontal", "vertical"]).default("opposite"),
});
const SEAL_IMAGE_COLUMNS = { seal: "seal_image_type", emblem: "emblem_type" } as const;
type SealImageKind = keyof typeof SEAL_IMAGE_COLUMNS;
const sealImageKind = (kind: string | undefined): kind is SealImageKind => kind === "seal" || kind === "emblem";
const CredentialForm = z.object({
  code: z.string().regex(CERTIFICATE_CODE),
  ownerName: z.string().trim().min(2).max(200),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(""),
  sealed: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});
const ShareForm = z.object({
  recipient: z.string().trim().min(2).max(200),
  comment: z.string().trim().max(1000).default(""),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
const MONTHS_SHOWN = 6;

const httpUrl = z.url({ protocol: /^https?$/ }).max(300);
const NetworkForm = z.object({
  name: z.string().trim().min(2).max(80),
  chainId: z.number().int().positive(),
  rpcUrl: httpUrl,
  explorerUrl: httpUrl,
  registry: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
export type NetworkSettings = z.infer<typeof NetworkForm>;
const MAX_EXTRA_NETWORKS = 10;

/** Networks public checks also search. Issuing and sign-in stay on the main network. */
const extraNetworks = async (db: Db): Promise<NetworkSettings[]> => {
  const { rows } = await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'networks'");
  return rows[0] ? JSON.parse(rows[0].value) : [];
};
const saveExtraNetworks = (db: Db, networks: NetworkSettings[]) => db.query(
  "INSERT INTO settings (key, value) VALUES ('networks', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
  [JSON.stringify(networks)],
);
const networkLogos = async (db: Db): Promise<Record<string, string>> => {
  const { rows } = await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'network_logos'");
  return rows[0] ? JSON.parse(rows[0].value) : {};
};

/** Saved details override the deployment's defaults. */
export async function savedNetwork(db: Db): Promise<Partial<NetworkSettings>> {
  const { rows } = await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'network'");
  return rows[0] ? JSON.parse(rows[0].value) : {};
}

const ApplicationChallenge = z.object({ institutionName: z.string().trim().min(2).max(200) });
/** Anything unexpected falls back to English, because a language should never fail a form. */
const FormLocale = z.enum(["en", "sw", "zh"]).catch("en");
const ApplicationForm = ApplicationChallenge.extend({
  locale: FormLocale,
  registrationNumber: z.string().trim().min(2).max(100),
  institutionType: z.enum(INSTITUTION_TYPES),
  country: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  website: z.string().trim().max(200).default(""),
  officialEmail: z.email().max(254),
  phone: z.string().trim().min(5).max(40),
  applicantName: z.string().trim().min(2).max(120),
  applicantPosition: z.string().trim().min(2).max(120),
  applicantEmail: z.email().max(254),
  signatoryName: z.string().trim().min(2).max(120),
  signatoryTitle: z.string().trim().min(2).max(120),
  identityDocument: z.enum(["national_id", "passport", "driving_licence", "voter_id"]),
  identityNumber: z.string().trim().regex(/^[A-Za-z0-9 /-]{4,40}$/),
  identityConsent: z.literal("true"),
  confirmed: z.literal("true"),
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});
const applicationMessage = (institutionName: string, nonce: string) =>
  `Apply to Legitfy with this wallet as administrator of:\n${institutionName}\nNonce: ${nonce}`;
type EvidenceKind = "registration" | "mandate";
const evidenceFile = (id: string, kind: EvidenceKind) => `${id}-${kind}`;
/** Sealed letters are often phone photos, so these accept images as well as PDFs. */
function evidenceType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  return null;
}

/** Zero-filled monthly counts, so empty months still appear on the chart. */
function monthlySeries(rows: { month: string; n: number }[], now = new Date()) {
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.n)]));
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_SHOWN - 1 - i), 1));
    const month = d.toISOString().slice(0, 7);
    return { month, count: byMonth.get(month) ?? 0 };
  });
}
type Env = { Variables: { session: Session } };

const RequestForm = z.object({
  institutionId: z.coerce.number().int().positive(),
  requesterOrg: z.string().trim().min(2).max(200),
  requesterEmail: z.email().max(254),
  locale: FormLocale,
  subject: z.string().trim().min(3).max(200),
  purpose: z.string().trim().min(3).max(2000),
  consentAgent: z.enum(["true", "false"]).transform((v) => v === "true"),
});

const Answer = z
  .object({
    outcome: z.enum(["confirmed", "not_confirmed", "needs_information"]),
    note: z.string().trim().max(2000).default(""),
  })
  .refine((a) => a.outcome === "confirmed" || a.note.length > 0, { message: "Explain this outcome in a note" });

const MAX_TRACKED_CLIENTS = 10_000;

/** A proxy appends the address it saw, so only the last entry can't be forged by the client. */
function clientKey(c: Context, trustProxy: boolean) {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local";
  }
}

/** Small per-process limiter for public writes. Put a real one at the edge in production. */
function rateLimit(max: number, windowMs: number, trustProxy: boolean) {
  const hits = new Map<string, { n: number; reset: number }>();
  return async (c: Context, next: () => Promise<void>) => {
    const key = clientKey(c, trustProxy);
    const now = Date.now();
    if (hits.size > MAX_TRACKED_CLIENTS) {
      for (const [client, hit] of hits) if (hit.reset < now) hits.delete(client);
    }
    const hit = hits.get(key);
    if (!hit || hit.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++hit.n > max) return c.json({ error: "Too many requests. Try again later." }, 429);
    await next();
  };
}

export function createApp(deps: Deps) {
  const { db, chain } = deps;
  const app = new Hono<Env>();
  const limit = (max: number, windowMs: number) => rateLimit(max, windowMs, deps.trustProxy ?? false);
  const fileDir = path.join(deps.dataDir, "files");
  const filePath = (id: string) => path.join(fileDir, `${id}.bin`);
  const uploadLimit = bodyLimit({ maxSize: MAX_FILE_BYTES + 64 * 1024, onError: (c) => c.json({ error: "Files can be up to 15 MB." }, 413) });
  /** Email is a courtesy: a failure here must never undo or block what already happened. */
  const notify = async (to: (string | null | undefined)[], kind: EmailKind, locale: string, data: EmailData) => {
    if (!deps.mailer) return;
    const email = renderEmail(kind, locale as Locale, data);
    for (const address of new Set(to.filter(Boolean) as string[])) {
      await deps.mailer.send({ to: address, ...email }).catch((e) => console.error(`email failed: ${kind}`, (e as Error).message));
    }
  };

  const statusOf = async (fileSha: string) => {
    const match = await chain.verifyByHash(`0x${fileSha}`).catch(() => null);
    return match?.status === "not_found" || !match ? "pending" : match.status;
  };

  /** Platform owner only. Separate from `staff`, which requires institution membership. */
  const platform = async (c: Context<Env>, next: () => Promise<void>) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!token) return c.json({ error: "Sign in first." }, 401);
    try {
      const sub = (await verify(token, deps.sessionSecret, "HS256")).sub as string;
      if (sub.toLowerCase() !== (await chain.platformOwner()).toLowerCase()) throw new Error("not owner");
    } catch {
      return c.json({ error: "Only the platform admin can do this." }, 403);
    }
    await next();
  };

  app.use("*", cors({ origin: deps.webOrigin, allowHeaders: ["authorization", "content-type"] }));

  const staff = async (c: Context<Env>, next: () => Promise<void>) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!token) return c.json({ error: "Sign in first." }, 401);
    let account: Address;
    try {
      account = (await verify(token, deps.sessionSecret, "HS256")).sub as Address;
    } catch {
      return c.json({ error: "Session expired. Sign in again." }, 401);
    }
    // Chain is the source of truth, so removing someone takes effect on their next call.
    const member = await chain.getMember(account);
    if (member.role === "none") return c.json({ error: "This account no longer has access." }, 403);
    const row = await db.query<{ level: number }>("SELECT level FROM staff WHERE account = $1", [account]);
    const level = member.role === "admin" ? 3 : (row.rows[0]?.level ?? 1);
    c.set("session", { account, institutionId: member.institutionId, role: member.role, level });
    await next();
  };

  const ownRequest = async (id: string, institutionId: number) => {
    if (!z.uuid().safeParse(id).success) return null;
    const { rows } = await db.query<Record<string, any>>(
      "SELECT * FROM requests WHERE id = $1 AND institution_id = $2",
      [id, institutionId],
    );
    return rows[0] ?? null;
  };

  // ------------------------------------------------------------------ public

  app.get("/health", (c) => c.json({ ok: true }));

  // ----------------------------------------------------------- public verify API

  /** "No record" only counts if every network replied: one that didn't could hold the certificate. */
  const verifyOnEveryNetwork = async (by: "id" | "hash", value: Hex) => {
    const main = { ...deps.network, registry: deps.registry, ...(await savedNetwork(db)) };
    const others = await extraNetworks(db);
    const results = await Promise.allSettled([
      chain.verify(by, value).then((record) => ({ ...record, network: main.name })),
      ...others.map((n) => chain.verify(by, value, { rpcUrl: n.rpcUrl, registry: n.registry as Address }).then((record) => ({ ...record, network: n.name }))),
    ]);
    const answers = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const found = answers.find((r) => r.status !== "not_found");
    if (found) return found;
    return results.some((r) => r.status === "rejected") ? null : { status: "not_found" as const };
  };
  const verifyAnswer = async (c: Context<Env>, by: "id" | "hash", value: Hex) => {
    const record = await verifyOnEveryNetwork(by, value);
    if (!record) return c.json({ error: "The public record can't be reached right now. Try again." }, 503);
    return c.json(record);
  };

  app.get("/public/verify/file/:hash", limit(60, 60_000), async (c) => {
    const hash = c.req.param("hash")!.toLowerCase();
    if (!ON_CHAIN_HASH.test(hash)) return c.json({ error: "Send the file's SHA-256 hash, starting with 0x." }, 400);
    return verifyAnswer(c, "hash", hash as Hex);
  });

  app.get("/public/verify/:id", limit(60, 60_000), async (c) => {
    const id = c.req.param("id")!.trim();
    if (ON_CHAIN_HASH.test(id.toLowerCase())) return verifyAnswer(c, "id", id.toLowerCase() as Hex);
    const code = id.toUpperCase();
    if (!CERTIFICATE_CODE.test(code)) return c.json({ error: "That isn't a certificate ID." }, 400);
    return verifyAnswer(c, "id", credentialIdFor(code));
  });

  app.get("/network", async (c) => {
    const logos = await networkLogos(db);
    const main = { ...deps.network, registry: deps.registry, ...(await savedNetwork(db)) };
    return c.json({
      ...main, hasLogo: String(main.chainId) in logos,
      others: (await extraNetworks(db)).map((n) => ({ ...n, hasLogo: String(n.chainId) in logos })),
    });
  });

  app.get("/networks/:chainId/logo", async (c) => {
    const id = Number(c.req.param("chainId"));
    const type = (await networkLogos(db))[String(id)];
    if (!Number.isInteger(id) || !type) return c.json({ error: "Not found." }, 404);
    return c.body(new Uint8Array(await readFile(filePath(`network-logo-${id}`))), 200, {
      "content-type": type, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff",
    });
  });

  app.get("/institutions", async (c) => {
    const { rows } = await db.query("SELECT id, name FROM institutions WHERE active ORDER BY name");
    return c.json(rows);
  });

  /** Only institutions that chose to appear, so being registered never implies an endorsement. */
  app.get("/institutions/showcase", async (c) => {
    const { rows } = await db.query(
      "SELECT id, name, location FROM institutions WHERE active AND listed AND logo_type IS NOT NULL ORDER BY name LIMIT 60",
    );
    return c.json(rows);
  });

  app.get("/institutions/:id/logo", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Not found." }, 404);
    const { rows } = await db.query<{ logo_type: string }>(
      "SELECT logo_type FROM institutions WHERE id = $1 AND active AND listed AND logo_type IS NOT NULL", [id],
    );
    if (!rows[0]) return c.json({ error: "Not found." }, 404);
    const logo = await readFile(filePath(`logo-${id}`));
    return c.body(new Uint8Array(logo), 200, {
      "content-type": rows[0].logo_type, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff",
    });
  });

  app.post(
    "/requests",
    limit(10, 60_000),
    uploadLimit,
    async (c) => {
      const body = await c.req.parseBody();
      const form = RequestForm.safeParse(body);
      if (!form.success) return c.json({ error: "Check the form and try again.", issues: z.flattenError(form.error) }, 400);
      const file = body.file;
      if (!(file instanceof File)) return c.json({ error: "Attach the document as a PDF." }, 400);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length > MAX_FILE_BYTES) return c.json({ error: "Files can be up to 15 MB." }, 413);
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return c.json({ error: "Attach the document as a PDF." }, 400);

      const f = form.data;
      const inst = await db.query<{ name: string; agent_enabled: boolean; official_email: string; locale: string }>(
        "SELECT name, agent_enabled, official_email, locale FROM institutions WHERE id = $1 AND active",
        [f.institutionId],
      );
      const institution = inst.rows[0];
      if (!institution) return c.json({ error: "That institution isn't accepting requests." }, 404);

      const id = randomUUID();
      const trackingToken = randomBytes(24).toString("base64url");
      const fileSha = sha256Hex(bytes);
      await mkdir(fileDir, { recursive: true });
      await writeFile(filePath(id), encryptFile(deps.fileMasterKey, f.institutionId, id, bytes));

      // Hash lookup needs no consent: nothing leaves the service but a hash.
      const match = await chain.verifyByHash(`0x${fileSha}`).catch(() => null);
      const now = new Date();
      await db.query(
        `INSERT INTO requests (id, institution_id, requester_org, requester_email, subject, purpose, consent_agent,
           file_name, file_size, file_sha256, tracking_hash, due_at, registry_status, registry_institution, registry_institution_id, locale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, f.institutionId, f.requesterOrg, f.requesterEmail, f.subject, f.purpose, f.consentAgent,
         file.name.slice(0, 255), bytes.length, fileSha, sha256Hex(trackingToken), dueAt(1, now).toISOString(),
         match?.status ?? "unchecked", match?.institutionName ?? null, match?.institutionId ?? null, f.locale],
      );
      await appendAudit(db, {
        requestId: id, institutionId: f.institutionId, actor: "requester", action: "request.received",
        detail: { fileSha, consentAgent: f.consentAgent },
      });

      const otherIssuer = match?.institutionId != null && match.institutionId !== f.institutionId;
      if (deps.triager && institution.agent_enabled && f.consentAgent) {
        await runTriage(id, f.institutionId, bytes, f.subject, institution.name, match?.status ?? "unchecked", otherIssuer);
      } else if (match) {
        await applyRouting(id, f.institutionId, 1, { riskLevel: "low", confidence: 1 }, match.status, otherIssuer);
      }
      await notify([f.requesterEmail], "requestReceived", f.locale, { institution: institution.name, link: `${deps.webOrigin}/track/${trackingToken}` });
      await notify([institution.official_email], "newRequest", institution.locale, { institution: institution.name, link: `${deps.webOrigin}/app/inbox` });
      return c.json({ id, trackingToken }, 201);
    },
  );

  const applyRouting = async (
    id: string, institutionId: number, level: number,
    t: Pick<Triage, "riskLevel" | "confidence">, registryStatus: string, otherIssuer: boolean,
  ) => {
    const routing = routeAfterTriage({
      level, risk: t.riskLevel, confidence: t.confidence,
      registryStatus: registryStatus === "suspended" || registryStatus === "revoked" ? registryStatus : "ok",
      otherIssuer,
    });
    await db.query(
      `UPDATE requests SET level = $1, priority = $2, escalation_reason = COALESCE($3, escalation_reason),
         due_at = CASE WHEN $1::int > level THEN $4::timestamptz ELSE due_at END WHERE id = $5`,
      [routing.level, routing.priority, routing.reason, dueAt(routing.level, new Date()).toISOString(), id],
    );
    if (routing.reason) {
      await appendAudit(db, {
        requestId: id, institutionId, actor: "system", action: "request.escalated",
        detail: { level: routing.level, reason: routing.reason },
      });
    }
  };

  const runTriage = async (
    id: string, institutionId: number, bytes: Buffer, subject: string, institution: string, registryStatus: string, otherIssuer: boolean,
  ) => {
    let triage: Triage | null = null;
    try {
      triage = await deps.triager!(bytes, { subject, institution });
    } catch (error) {
      console.error("triage failed", id, error);
    }
    if (!triage) {
      await db.query("UPDATE requests SET triage_status = 'unavailable' WHERE id = $1", [id]);
      await appendAudit(db, { requestId: id, institutionId, actor: "agent", action: "triage.unavailable" });
      return;
    }
    await db.query("UPDATE requests SET triage_status = 'done', triage = $1 WHERE id = $2", [JSON.stringify(triage), id]);
    await appendAudit(db, {
      requestId: id, institutionId, actor: "agent", action: "triage.done",
      detail: { risk: triage.riskLevel, confidence: triage.confidence },
    });
    await applyRouting(id, institutionId, 1, triage, registryStatus, otherIssuer);
  };

  app.get("/requests/track/:token", async (c) => {
    const { rows } = await db.query<Record<string, any>>(
      `SELECT r.status, r.created_at, r.due_at, r.answer_outcome, r.answer_note, r.answered_at, r.receipt_hash,
              r.subject, i.name AS institution
       FROM requests r JOIN institutions i ON i.id = r.institution_id WHERE r.tracking_hash = $1`,
      [sha256Hex(c.req.param("token"))],
    );
    const r = rows[0];
    if (!r) return c.json({ error: "No request matches this link." }, 404);
    return c.json({
      subject: r.subject, institution: r.institution, status: r.status, submittedAt: r.created_at, dueAt: r.due_at,
      outcome: r.answer_outcome, note: r.answer_note, answeredAt: r.answered_at, receipt: r.receipt_hash,
    });
  });

  // -------------------------------------------------------------------- auth

  app.post("/auth/challenge", limit(30, 60_000), async (c) => {
    const nonce = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + NONCE_SECONDS * 1000);
    await db.query("INSERT INTO login_nonces (nonce, expires_at) VALUES ($1, $2)", [nonce, expires.toISOString()]);
    return c.json({ nonce, message: `Sign in to Legitfy\nNonce: ${nonce}` });
  });

  app.post("/auth/login", limit(30, 60_000), async (c) => {
    const body = z
      .object({ nonce: z.string().regex(/^[0-9a-f]{32}$/), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Sign-in request was malformed." }, 400);
    const used = await db.query("DELETE FROM login_nonces WHERE nonce = $1 AND expires_at > now() RETURNING nonce", [body.data.nonce]);
    if (used.rows.length === 0) return c.json({ error: "Sign-in expired. Try again." }, 401);

    const owner = await recoverMessageAddress({
      message: `Sign in to Legitfy\nNonce: ${body.data.nonce}`,
      signature: body.data.signature as Hex,
    });
    const sign_ = (sub: Address) =>
      sign({ sub, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, deps.sessionSecret, "HS256");
    if (owner.toLowerCase() === (await chain.platformOwner()).toLowerCase()) {
      return c.json({ token: await sign_(owner), account: owner, owner, role: "platform", mode: "eoa" });
    }
    // A wallet can be a member itself (e.g. a hardware-wallet admin) or own a smart account.
    // SimpleAccount has no ERC-1271, so identity is the owner key plus the account it derives.
    const direct = await chain.getMember(owner);
    const mode = direct.role === "none" ? "smart" : "eoa";
    const account = mode === "eoa" ? owner : await chain.accountOf(owner);
    const member = mode === "eoa" ? direct : await chain.getMember(account);
    if (member.role === "none") return c.json({ error: "This wallet isn't part of an institution yet.", account }, 403);
    await db.query(
      "INSERT INTO staff (account, institution_id) VALUES ($1, $2) ON CONFLICT (account) DO UPDATE SET institution_id = $2",
      [account, member.institutionId],
    );
    return c.json({ token: await sign_(account), account, owner, institutionId: member.institutionId, role: member.role, mode });
  });

  // ------------------------------------------------------------------- staff

  app.get("/me", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<{
      name: string; agent_enabled: boolean; listed: boolean; logo_type: string | null;
      seal_style: unknown; seal_image_type: string | null; emblem_type: string | null;
    }>(
      "SELECT name, agent_enabled, listed, logo_type, seal_style, seal_image_type, emblem_type FROM institutions WHERE id = $1",
      [s.institutionId],
    );
    return c.json({
      ...s, institution: rows[0]?.name, agentEnabled: rows[0]?.agent_enabled ?? false,
      listed: rows[0]?.listed ?? false, hasLogo: Boolean(rows[0]?.logo_type),
      seal: sealStyle(s.institutionId, rows[0]?.seal_style),
      sealImages: { seal: Boolean(rows[0]?.seal_image_type), emblem: Boolean(rows[0]?.emblem_type) },
    });
  });

  app.put("/institution/agent", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = z.object({ enabled: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Send enabled as true or false." }, 400);
    await db.query("UPDATE institutions SET agent_enabled = $1 WHERE id = $2", [body.data.enabled, s.institutionId]);
    await appendAudit(db, {
      requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.agent", detail: body.data,
    });
    return c.json(body.data);
  });

  /** PNG or JPEG only: an SVG can carry script, and this file is served publicly. */
  app.post("/institution/logo", staff, uploadLimit, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: "Upload the logo as a PNG or JPEG." }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) return c.json({ error: "Logos can be up to 1 MB." }, 413);
    const type = evidenceType(bytes);
    if (!type?.startsWith("image/")) return c.json({ error: "Upload the logo as a PNG or JPEG." }, 400);
    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath(`logo-${s.institutionId}`), bytes);
    await db.query("UPDATE institutions SET logo_type = $1 WHERE id = $2", [type, s.institutionId]);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.logo" });
    return c.json({ ok: true });
  });

  app.put("/institution/seal", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = SealForm.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Check the seal details." }, 400);
    await db.query("UPDATE institutions SET seal_style = $1::jsonb WHERE id = $2", [JSON.stringify(body.data), s.institutionId]);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.seal", detail: body.data });
    return c.json(body.data);
  });

  const sealImageFile = (kind: SealImageKind, id: number) => `${kind}-image-${id}`;

  app.post("/institution/seal-image/:kind", staff, uploadLimit, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const kind = c.req.param("kind");
    if (!sealImageKind(kind)) return c.json({ error: "Not found." }, 404);
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: "Upload the image as a PNG or JPEG." }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) return c.json({ error: "Images can be up to 1 MB." }, 413);
    const type = evidenceType(bytes);
    if (!type?.startsWith("image/")) return c.json({ error: "Upload the image as a PNG or JPEG." }, 400);
    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath(sealImageFile(kind, s.institutionId)), bytes);
    await db.query(`UPDATE institutions SET ${SEAL_IMAGE_COLUMNS[kind]} = $1 WHERE id = $2`, [type, s.institutionId]);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.seal_image", detail: { kind } });
    return c.json({ ok: true });
  });

  app.get("/institution/seal-image/:kind", staff, async (c) => {
    const s = c.get("session");
    const kind = c.req.param("kind");
    if (!sealImageKind(kind)) return c.json({ error: "Not found." }, 404);
    const { rows } = await db.query<{ type: string | null }>(`SELECT ${SEAL_IMAGE_COLUMNS[kind]} AS type FROM institutions WHERE id = $1`, [s.institutionId]);
    if (!rows[0]?.type) return c.json({ error: "Not found." }, 404);
    const image = await readFile(filePath(sealImageFile(kind, s.institutionId)));
    return c.body(new Uint8Array(image), 200, { "content-type": rows[0].type, "cache-control": "no-store" });
  });

  app.delete("/institution/seal-image/:kind", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const kind = c.req.param("kind");
    if (!sealImageKind(kind)) return c.json({ error: "Not found." }, 404);
    await db.query(`UPDATE institutions SET ${SEAL_IMAGE_COLUMNS[kind]} = NULL WHERE id = $1`, [s.institutionId]);
    await rm(filePath(sealImageFile(kind, s.institutionId)), { force: true });
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.seal_image_removed", detail: { kind } });
    return c.json({ ok: true });
  });

  /** Unlike the public logo route, this works before the institution opts in to the listing. */
  app.get("/institution/logo", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<{ logo_type: string | null }>("SELECT logo_type FROM institutions WHERE id = $1", [s.institutionId]);
    if (!rows[0]?.logo_type) return c.json({ error: "Not found." }, 404);
    const logo = await readFile(filePath(`logo-${s.institutionId}`));
    return c.body(new Uint8Array(logo), 200, { "content-type": rows[0].logo_type, "cache-control": "no-store" });
  });

  app.put("/institution/listing", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = z.object({ listed: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Send listed as true or false." }, 400);
    const res = await db.query(
      "UPDATE institutions SET listed = $1 WHERE id = $2 AND ($1 = FALSE OR logo_type IS NOT NULL) RETURNING id",
      [body.data.listed, s.institutionId],
    );
    if (res.rows.length === 0) return c.json({ error: "Add a logo first." }, 409);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.listing", detail: body.data });
    return c.json(body.data);
  });

  app.put("/staff/:account/level", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = z.object({ level: z.number().int().min(1).max(3) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Level must be 1, 2 or 3." }, 400);
    const raw = c.req.param("account")!;
    if (!isAddress(raw, { strict: false })) return c.json({ error: "No such staff member." }, 404);
    const account = getAddress(raw.toLowerCase());
    const res = await db.query(
      "UPDATE staff SET level = $1 WHERE account = $2 AND institution_id = $3 RETURNING account",
      [body.data.level, account, s.institutionId],
    );
    if (res.rows.length === 0) return c.json({ error: "No such staff member." }, 404);
    await appendAudit(db, {
      requestId: null, institutionId: s.institutionId, actor: s.account, action: "staff.level",
      detail: { account, level: body.data.level },
    });
    return c.json(body.data);
  });

  app.get("/stats", staff, async (c) => {
    const s = c.get("session");
    const one = async (sql: string) =>
      Number((await db.query<{ n: number }>(sql, [s.institutionId])).rows[0]?.n ?? 0);
    const series = async (table: string) =>
      monthlySeries((await db.query<{ month: string; n: number }>(
        `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS n FROM ${table}
         WHERE institution_id = $1 GROUP BY 1`, [s.institutionId])).rows);
    return c.json({
      operators: await one("SELECT count(*)::int AS n FROM staff WHERE institution_id = $1"),
      documents: await one("SELECT count(*)::int AS n FROM credentials WHERE institution_id = $1"),
      openRequests: await one("SELECT count(*)::int AS n FROM requests WHERE institution_id = $1 AND status <> 'answered'"),
      answered: await one("SELECT count(*)::int AS n FROM requests WHERE institution_id = $1 AND status = 'answered'"),
      storageBytes: await one(`SELECT (COALESCE((SELECT sum(file_size) FROM credentials WHERE institution_id = $1), 0)
        + COALESCE((SELECT sum(file_size) FROM requests WHERE institution_id = $1), 0))::bigint AS n`),
      documentsByMonth: await series("credentials"),
      requestsByMonth: await series("requests"),
    });
  });

  app.get("/staff", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<{ account: Address; name: string; position: string; level: number }>(
      "SELECT account, name, position, level FROM staff WHERE institution_id = $1 ORDER BY name, account",
      [s.institutionId],
    );
    // Chain decides who is still a member, so removal needs no second bookkeeping step.
    const live = await Promise.all(rows.map(async (r) => ({ ...r, member: await chain.getMember(r.account) })));
    return c.json(live.filter((r) => r.member.role !== "none" && r.member.institutionId === s.institutionId)
      .map(({ member, ...r }) => ({ ...r, role: member.role })));
  });

  /** Saves a member's name and position after the on-chain add. */
  app.post("/staff", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = z.object({
      account: z.string().regex(/^0x[0-9a-fA-F]{40}$/), name: z.string().trim().min(2).max(120), position: z.string().trim().max(120).default(""),
    }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name and a valid wallet address." }, 400);
    // One spelling only: sign-in stores the checksummed address, so any other case would be a second person.
    const account = getAddress(body.data.account.toLowerCase());
    const member = await chain.getMember(account);
    if (member.institutionId !== s.institutionId) return c.json({ error: "Add this wallet on-chain first." }, 409);
    await db.query(
      `INSERT INTO staff (account, institution_id, name, position) VALUES ($1,$2,$3,$4)
       ON CONFLICT (account) DO UPDATE SET name = $3, position = $4`,
      [account, s.institutionId, body.data.name, body.data.position],
    );
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "staff.added", detail: { account } });
    return c.json({ ok: true }, 201);
  });

  /** Holds the file and private details; the public record gets only the hash. */
  app.post("/credentials", staff, uploadLimit, async (c) => {
    const s = c.get("session");
    const body = await c.req.parseBody();
    const form = CredentialForm.safeParse(body);
    if (!form.success) return c.json({ error: "Check the certificate details." }, 400);
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "Attach the certificate as a PDF." }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) return c.json({ error: "Files can be up to 15 MB." }, 413);
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return c.json({ error: "Attach the certificate as a PDF." }, 400);
    const f = form.data;
    const sha = sha256Hex(bytes);
    const credentialId = credentialIdFor(f.code);
    // A seal makes every copy unique. Without one, the registry would refuse the same file twice.
    if (!f.sealed) {
      const { rows } = await db.query("SELECT 1 FROM credentials WHERE file_sha256 = $1 LIMIT 1", [sha]);
      if (rows.length > 0) return c.json({ error: "This file is already saved." }, 409);
    }
    // The ID comes from the client, so claim it before touching the disk: a repeat must never
    // reach writeFile, or it would replace a file that may belong to another institution.
    const claimed = await db.query(
      `INSERT INTO credentials (id, code, institution_id, owner_name, title, description, file_name, file_size, file_sha256, created_by, sealed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [credentialId, f.code, s.institutionId, f.ownerName, f.title, f.description, file.name.slice(0, 255), bytes.length, sha, s.account, f.sealed],
    );
    if (claimed.rows.length === 0) return c.json({ error: "This certificate ID is already in use." }, 409);
    try {
      await mkdir(fileDir, { recursive: true });
      await writeFile(filePath(credentialId), encryptFile(deps.fileMasterKey, s.institutionId, credentialId, bytes));
    } catch (e) {
      await db.query("DELETE FROM credentials WHERE id = $1", [credentialId]);
      throw e;
    }
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "credential.created", detail: { sha } });
    return c.json({ fileHash: `0x${sha}` }, 201);
  });

  const ownCredential = async (id: string, institutionId: number) => {
    const { rows } = await db.query<Record<string, any>>(
      "SELECT * FROM credentials WHERE id = $1 AND institution_id = $2", [id, institutionId],
    );
    return rows[0] ?? null;
  };

  app.get("/credentials", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<Record<string, any>>(
      `SELECT id, code, owner_name, title, file_sha256, created_at FROM credentials
       WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 200`, [s.institutionId],
    );
    return c.json(await Promise.all(rows.map(async (r) => ({ ...r, status: await statusOf(r.file_sha256) }))));
  });

  app.get("/credentials/:id", staff, async (c) => {
    const s = c.get("session");
    const r = await ownCredential(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const shares = await db.query(
      `SELECT id, recipient, comment, shared_by, expires_at, revoked_at, created_at FROM shares
       WHERE credential_id = $1 ORDER BY created_at DESC`, [r.id],
    );
    return c.json({ ...r, status: await statusOf(r.file_sha256), shares: shares.rows });
  });

  app.get("/credentials/:id/file", staff, async (c) => {
    const s = c.get("session");
    const r = await ownCredential(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const plain = decryptFile(deps.fileMasterKey, s.institutionId, r.id, await readFile(filePath(r.id)));
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "credential.viewed", detail: { id: r.id } });
    return c.body(new Uint8Array(plain), 200, { "content-type": "application/pdf", "cache-control": "no-store" });
  });

  /** The link token is shown once and only its hash is stored. */
  app.post("/credentials/:id/shares", staff, async (c) => {
    const s = c.get("session");
    const r = await ownCredential(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const body = ShareForm.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Say who this link is for." }, 400);
    const token = randomBytes(24).toString("base64url");
    const expires = new Date(Date.now() + body.data.expiresInDays * 86_400_000);
    await db.query(
      `INSERT INTO shares (id, credential_id, recipient, comment, token_hash, shared_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), r.id, body.data.recipient, body.data.comment, sha256Hex(token), s.account, expires.toISOString()],
    );
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "credential.shared", detail: { id: r.id, recipient: body.data.recipient } });
    return c.json({ token, expiresAt: expires }, 201);
  });

  app.post("/credentials/:id/shares/:shareId/revoke", staff, async (c) => {
    const s = c.get("session");
    const r = await ownCredential(c.req.param("id")!, s.institutionId);
    if (!r || !z.uuid().safeParse(c.req.param("shareId")).success) return c.json({ error: "Not found." }, 404);
    await db.query("UPDATE shares SET revoked_at = now() WHERE id = $1 AND credential_id = $2", [c.req.param("shareId"), r.id]);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "credential.share_revoked", detail: { id: r.id } });
    return c.json({ ok: true });
  });

  const liveShare = async (token: string) => {
    const { rows } = await db.query<Record<string, any>>(
      `SELECT s.recipient, s.comment, s.expires_at, c.id, c.owner_name, c.title, c.description, c.file_name,
              c.file_sha256, c.institution_id, c.created_at, i.name AS institution
       FROM shares s JOIN credentials c ON c.id = s.credential_id JOIN institutions i ON i.id = c.institution_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [sha256Hex(token)],
    );
    return rows[0] ?? null;
  };

  app.get("/shared/:token", limit(60, 60_000), async (c) => {
    const r = await liveShare(c.req.param("token")!);
    if (!r) return c.json({ error: "This link has expired or was withdrawn." }, 404);
    const { institution_id: _i, file_sha256, ...safe } = r;
    return c.json({ ...safe, status: await statusOf(file_sha256) });
  });

  app.get("/shared/:token/file", limit(60, 60_000), async (c) => {
    const r = await liveShare(c.req.param("token")!);
    if (!r) return c.json({ error: "This link has expired or was withdrawn." }, 404);
    await appendAudit(db, { requestId: null, institutionId: r.institution_id, actor: "share-link", action: "credential.viewed", detail: { id: r.id } });
    const plain = decryptFile(deps.fileMasterKey, r.institution_id, r.id, await readFile(filePath(r.id)));
    return c.body(new Uint8Array(plain), 200, { "content-type": "application/pdf", "cache-control": "no-store" });
  });

  // ------------------------------------------------------------- applications

  /** Application files aren't tied to an institution yet, so they use a key of their own. */
  const APPLICATION_KEY_ID = 0;
  const identityLabel = (id: string) => `${id}-identity-number`;
  const sealIdentityNumber = (id: string, number: string) =>
    encryptFile(deps.fileMasterKey, APPLICATION_KEY_ID, identityLabel(id), Buffer.from(number)).toString("base64");
  const saveEvidence = async (id: string, kind: EvidenceKind, bytes: Buffer) => {
    await mkdir(fileDir, { recursive: true });
    const name = evidenceFile(id, kind);
    await writeFile(filePath(name), encryptFile(deps.fileMasterKey, APPLICATION_KEY_ID, name, bytes));
  };
  const readEvidence = async (value: unknown) => {
    if (!(value instanceof File)) return { error: "Attach the document as a PDF, JPEG or PNG." };
    const bytes = Buffer.from(await value.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) return { error: "Files can be up to 15 MB." };
    const type = evidenceType(bytes);
    return type ? { bytes, type } : { error: "Attach the document as a PDF, JPEG or PNG." };
  };

  app.post("/applications/challenge", limit(30, 60_000), async (c) => {
    const body = ApplicationChallenge.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter your institution's name." }, 400);
    const nonce = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + NONCE_SECONDS * 1000);
    await db.query("INSERT INTO login_nonces (nonce, expires_at) VALUES ($1, $2)", [nonce, expires.toISOString()]);
    return c.json({ nonce, message: applicationMessage(body.data.institutionName, nonce) });
  });

  /** The signature proves the applicant holds the wallet that will run the institution's account. */
  app.post("/applications", limit(5, 60 * 60_000), uploadLimit, async (c) => {
    const body = await c.req.parseBody();
    const form = ApplicationForm.safeParse(body);
    if (!form.success) return c.json({ error: "Check the form and try again.", issues: z.flattenError(form.error) }, 400);
    const f = form.data;
    const evidence = await readEvidence(body.file);
    if (!evidence.bytes) return c.json({ error: evidence.error }, evidence.error.startsWith("Files") ? 413 : 400);

    const used = await db.query("DELETE FROM login_nonces WHERE nonce = $1 AND expires_at > now() RETURNING nonce", [f.nonce]);
    if (used.rows.length === 0) return c.json({ error: "The wallet confirmation expired. Try again." }, 401);
    let wallet: Address;
    try {
      wallet = await recoverMessageAddress({ message: applicationMessage(f.institutionName, f.nonce), signature: f.signature as Hex });
    } catch {
      return c.json({ error: "The wallet confirmation didn't work. Try again." }, 400);
    }
    if ((await chain.getMember(wallet)).role !== "none") return c.json({ error: "This wallet already belongs to an institution." }, 409);

    const id = randomUUID();
    const trackingToken = randomBytes(24).toString("base64url");
    const claimed = await db.query(
      `INSERT INTO applications (id, institution_name, registration_number, institution_type, country, city, website,
         official_email, phone, applicant_name, applicant_position, applicant_email, signatory_name, signatory_title, wallet,
         registration_type, tracking_hash, identity_document, identity_number, identity_consent_at, locale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),$20) ON CONFLICT DO NOTHING RETURNING id`,
      [id, f.institutionName, f.registrationNumber, f.institutionType, f.country, f.city, f.website, f.officialEmail, f.phone,
       f.applicantName, f.applicantPosition, f.applicantEmail, f.signatoryName, f.signatoryTitle, wallet, evidence.type, sha256Hex(trackingToken),
       f.identityDocument, sealIdentityNumber(id, f.identityNumber), f.locale],
    );
    if (claimed.rows.length === 0) return c.json({ error: "An application with this registration number or wallet is already open." }, 409);
    try {
      await saveEvidence(id, "registration", evidence.bytes);
    } catch (e) {
      await db.query("DELETE FROM applications WHERE id = $1", [id]);
      await rm(filePath(evidenceFile(id, "registration")), { force: true });
      throw e;
    }
    await appendAudit(db, { requestId: null, institutionId: null, actor: "applicant", action: "application.received", detail: { id } });
    await notify([f.applicantEmail], "applicationReceived", f.locale, {
      name: f.applicantName, institution: f.institutionName, link: `${deps.webOrigin}/apply/${trackingToken}`,
    });
    return c.json({ trackingToken }, 201);
  });

  const trackedApplication = async (token: string) => {
    const { rows } = await db.query<Record<string, any>>("SELECT * FROM applications WHERE tracking_hash = $1", [sha256Hex(token)]);
    return rows[0] ?? null;
  };

  app.get("/applications/track/:token", limit(60, 60_000), async (c) => {
    const a = await trackedApplication(c.req.param("token")!);
    if (!a) return c.json({ error: "No application matches this link." }, 404);
    return c.json({
      reference: a.id.slice(0, 8), institutionName: a.institution_name, registrationNumber: a.registration_number,
      city: a.city, country: a.country, applicantName: a.applicant_name, applicantPosition: a.applicant_position, applicantEmail: a.applicant_email,
      signatoryName: a.signatory_name, signatoryTitle: a.signatory_title, wallet: a.wallet, status: a.status,
      reviewReason: a.review_reason, submittedAt: a.created_at,
    });
  });

  app.post("/applications/track/:token/mandate", limit(10, 60_000), uploadLimit, async (c) => {
    const a = await trackedApplication(c.req.param("token")!);
    if (!a) return c.json({ error: "No application matches this link." }, 404);
    if (a.status === "approved" || a.status === "rejected") return c.json({ error: "This application has already been decided." }, 409);
    const evidence = await readEvidence((await c.req.parseBody()).file);
    if (!evidence.bytes) return c.json({ error: evidence.error }, evidence.error.startsWith("Files") ? 413 : 400);
    await saveEvidence(a.id, "mandate", evidence.bytes);
    await db.query("UPDATE applications SET status = 'under_review', mandate_type = $1 WHERE id = $2", [evidence.type, a.id]);
    await appendAudit(db, { requestId: null, institutionId: null, actor: "applicant", action: "application.mandate", detail: { id: a.id } });
    return c.json({ status: "under_review" });
  });

  const anyApplication = async (id: string) => {
    if (!z.uuid().safeParse(id).success) return null;
    const { rows } = await db.query<Record<string, any>>("SELECT * FROM applications WHERE id = $1", [id]);
    return rows[0] ?? null;
  };

  app.get("/platform/applications", platform, async (c) => {
    const { rows } = await db.query(
      `SELECT id, institution_name, country, applicant_name, status, created_at FROM applications
       ORDER BY (status = 'under_review') DESC, (status = 'awaiting_mandate') DESC, created_at DESC LIMIT 200`,
    );
    return c.json(rows);
  });

  app.get("/platform/applications/:id", platform, async (c) => {
    const a = await anyApplication(c.req.param("id")!);
    if (!a) return c.json({ error: "Not found." }, 404);
    const { tracking_hash: _omit, identity_number: _number, ...safe } = a;
    return c.json({ ...safe, on_chain: (await chain.getMember(a.wallet)).role === "admin" });
  });

  app.get("/platform/applications/:id/files/:kind", platform, async (c) => {
    const a = await anyApplication(c.req.param("id")!);
    const kind = c.req.param("kind");
    const type = kind === "registration" ? a?.registration_type : kind === "mandate" ? a?.mandate_type : null;
    if (!a || !type) return c.json({ error: "Not found." }, 404);
    const name = evidenceFile(a.id, kind as EvidenceKind);
    const plain = decryptFile(deps.fileMasterKey, APPLICATION_KEY_ID, name, await readFile(filePath(name)));
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "application.file_viewed", detail: { id: a.id, kind } });
    return c.body(new Uint8Array(plain), 200, { "content-type": type, "cache-control": "no-store" });
  });

  // ------------------------------------------------------- institution profile

  const changeFile = (id: string) => `change-${id}`;
  const anyChange = async (id: string) => {
    if (!z.uuid().safeParse(id).success) return null;
    const { rows } = await db.query<Record<string, any>>("SELECT * FROM institution_changes WHERE id = $1", [id]);
    return rows[0] ?? null;
  };

  app.get("/institution/details", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<Record<string, any>>(
      `SELECT name, location, website, phone, official_email, registration_number, institution_type, country, city
       FROM institutions WHERE id = $1`, [s.institutionId],
    );
    const changes = await db.query(
      `SELECT id, field, old_value, new_value, reason, status, review_reason, reviewed_at, created_at
       FROM institution_changes WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 50`, [s.institutionId],
    );
    return c.json({ ...rows[0], changes: changes.rows });
  });

  app.put("/institution/details", staff, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = ContactForm.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Check the contact details." }, 400);
    await db.query("UPDATE institutions SET website = $1, phone = $2, official_email = $3 WHERE id = $4",
      [body.data.website, body.data.phone, body.data.officialEmail, s.institutionId]);
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.contacts", detail: body.data });
    return c.json({ ok: true });
  });

  app.post("/institution/changes", staff, uploadLimit, async (c) => {
    const s = c.get("session");
    if (s.role !== "admin") return c.json({ error: "Only the institution admin can change this." }, 403);
    const body = await c.req.parseBody();
    const form = ChangeForm.safeParse(body);
    if (!form.success) return c.json({ error: "Check the change you're requesting." }, 400);
    const evidence = await readEvidence(body.file);
    if (!evidence.bytes) return c.json({ error: evidence.error }, evidence.error.startsWith("Files") ? 413 : 400);
    const f = form.data;
    const id = randomUUID();
    // `field` is one of ChangeForm's fixed column names, never free text.
    const claimed = await db.query(
      `INSERT INTO institution_changes (id, institution_id, field, old_value, new_value, reason, evidence_type, requested_by)
       SELECT $1, i.id, $3, i.${f.field}, $4, $5, $6, $7 FROM institutions i WHERE i.id = $2
       ON CONFLICT DO NOTHING RETURNING id`,
      [id, s.institutionId, f.field, f.value, f.reason, evidence.type, s.account],
    );
    if (claimed.rows.length === 0) return c.json({ error: "This detail already has a request waiting for review." }, 409);
    try {
      await mkdir(fileDir, { recursive: true });
      await writeFile(filePath(changeFile(id)), encryptFile(deps.fileMasterKey, s.institutionId, changeFile(id), evidence.bytes));
    } catch (e) {
      await db.query("DELETE FROM institution_changes WHERE id = $1", [id]);
      throw e;
    }
    await appendAudit(db, { requestId: null, institutionId: s.institutionId, actor: s.account, action: "institution.change_requested", detail: { id, field: f.field } });
    return c.json({ id }, 201);
  });

  app.get("/platform/changes", platform, async (c) => {
    const { rows } = await db.query(
      `SELECT ch.id, ch.field, ch.old_value, ch.new_value, ch.reason, ch.created_at, i.name AS institution
       FROM institution_changes ch JOIN institutions i ON i.id = ch.institution_id
       WHERE ch.status = 'pending' ORDER BY ch.created_at ASC LIMIT 200`,
    );
    return c.json(rows);
  });

  app.get("/platform/changes/:id/file", platform, async (c) => {
    const r = await anyChange(c.req.param("id")!);
    if (!r) return c.json({ error: "Not found." }, 404);
    const name = changeFile(r.id);
    const plain = decryptFile(deps.fileMasterKey, r.institution_id, name, await readFile(filePath(name)));
    await appendAudit(db, { requestId: null, institutionId: r.institution_id, actor: "platform", action: "institution.change_file_viewed", detail: { id: r.id } });
    return c.body(new Uint8Array(plain), 200, { "content-type": r.evidence_type, "cache-control": "no-store" });
  });

  /** The status check makes a repeat harmless, so a double click can't apply an old value later. */
  const decideChange = async (id: string, status: "approved" | "rejected", reason: string | null) => {
    if (!z.uuid().safeParse(id).success) return null;
    const { rows } = await db.query<Record<string, any>>(
      `UPDATE institution_changes SET status = $2, review_reason = $3, reviewed_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`, [id, status, reason],
    );
    return rows[0] ?? null;
  };

  const notifyChange = async (r: Record<string, any>, kind: "changeApproved" | "changeRejected") => {
    const { rows } = await db.query<{ name: string; official_email: string; locale: Locale }>(
      "SELECT name, official_email, locale FROM institutions WHERE id = $1", [r.institution_id],
    );
    const i = rows[0];
    if (!i) return;
    await notify([i.official_email], kind, i.locale, {
      institution: i.name, field: fieldName(i.locale, r.field), value: r.new_value, reason: r.review_reason ?? "", link: `${deps.webOrigin}/app/institution`,
    });
  };

  app.post("/platform/changes/:id/approve", platform, async (c) => {
    const r = await decideChange(c.req.param("id")!, "approved", null);
    if (!r) return c.json({ error: "This request has already been decided." }, 409);
    const field = ChangeForm.parse({ field: r.field, value: r.new_value, reason: r.reason }).field;
    await db.query(`UPDATE institutions SET ${field} = $1 WHERE id = $2`, [r.new_value, r.institution_id]);
    if (field === "city" || field === "country") {
      await db.query("UPDATE institutions SET location = left(city || ', ' || country, 120) WHERE id = $1", [r.institution_id]);
    }
    await appendAudit(db, { requestId: null, institutionId: r.institution_id, actor: "platform", action: "institution.change_approved", detail: { id: r.id, field } });
    await notifyChange(r, "changeApproved");
    return c.json({ status: "approved" });
  });

  app.post("/platform/changes/:id/reject", platform, async (c) => {
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Explain why this change isn't approved." }, 400);
    const r = await decideChange(c.req.param("id")!, "rejected", body.data.reason);
    if (!r) return c.json({ error: "This request has already been decided." }, 409);
    await appendAudit(db, { requestId: null, institutionId: r.institution_id, actor: "platform", action: "institution.change_rejected", detail: { id: r.id } });
    await notifyChange(r, "changeRejected");
    return c.json({ status: "rejected" });
  });

  /** Asked for separately, so each look at an ID number is on the audit trail. */
  app.get("/platform/applications/:id/identity", platform, async (c) => {
    const a = await anyApplication(c.req.param("id")!);
    if (!a?.identity_number) return c.json({ error: "Not found." }, 404);
    const number = decryptFile(deps.fileMasterKey, APPLICATION_KEY_ID, identityLabel(a.id), Buffer.from(a.identity_number, "base64")).toString();
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "application.identity_viewed", detail: { id: a.id } });
    return c.json({ document: a.identity_document, number });
  });

  /** Runs after the on-chain registration, which is what actually admits the institution. */
  app.post("/platform/applications/:id/approve", platform, async (c) => {
    const a = await anyApplication(c.req.param("id")!);
    if (!a) return c.json({ error: "Not found." }, 404);
    if (a.status !== "under_review") return c.json({ error: "This application isn't ready for a decision." }, 409);
    const member = await chain.getMember(a.wallet);
    if (member.role !== "admin") return c.json({ error: "Register this institution on-chain first." }, 409);
    await syncInstitutions(db, chain);
    await db.query(
      `UPDATE institutions SET location = $1, website = $2, phone = $3, official_email = $4, registration_number = $5,
         institution_type = $6, country = $7, city = $8, locale = $10 WHERE id = $9`,
      [`${a.city}, ${a.country}`.slice(0, 120), a.website, a.phone, a.official_email, a.registration_number,
       a.institution_type, a.country, a.city, member.institutionId, a.locale],
    );
    await db.query(
      "UPDATE applications SET status = 'approved', reviewed_at = now(), institution_id = $1 WHERE id = $2",
      [member.institutionId, a.id],
    );
    await appendAudit(db, { requestId: null, institutionId: member.institutionId, actor: "platform", action: "application.approved", detail: { id: a.id } });
    await notify([a.applicant_email, a.official_email], "applicationApproved", a.locale, {
      name: a.applicant_name, institution: a.institution_name, link: `${deps.webOrigin}/sign-in`,
    });
    return c.json({ status: "approved", institutionId: member.institutionId });
  });

  app.post("/platform/applications/:id/reject", platform, async (c) => {
    const a = await anyApplication(c.req.param("id")!);
    if (!a) return c.json({ error: "Not found." }, 404);
    if (a.status === "approved" || a.status === "rejected") return c.json({ error: "This application has already been decided." }, 409);
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Tell the applicant why." }, 400);
    // Files go first: if that fails, the application stays open and rejecting again finishes the job.
    await rm(filePath(evidenceFile(a.id, "registration")), { force: true });
    await rm(filePath(evidenceFile(a.id, "mandate")), { force: true });
    // Keeps only what the tracking page needs to explain the decision. Nothing here can be recovered.
    await db.query(
      `UPDATE applications SET status = 'rejected', review_reason = $1, reviewed_at = now(),
         applicant_name = '', applicant_position = '', applicant_email = '', signatory_name = '', signatory_title = '',
         official_email = '', phone = '', wallet = '', registration_type = '', mandate_type = NULL,
         identity_document = NULL, identity_number = NULL, identity_consent_at = NULL
       WHERE id = $2`,
      [body.data.reason, a.id],
    );
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "application.rejected", detail: { id: a.id } });
    // Uses `a`, read before the erase above, and these addresses aren't kept after this.
    await notify([a.applicant_email, a.official_email], "applicationRejected", a.locale, {
      institution: a.institution_name, reason: body.data.reason, link: `${deps.webOrigin}/apply`,
    });
    return c.json({ status: "rejected" });
  });

  /**
   * Everything sign-in depends on comes from this network, so a mistake here could lock the admin
   * out. Nothing is saved unless the RPC answers on this chain and the admin still owns the registry.
   */
  app.put("/platform/network", platform, async (c) => {
    const body = NetworkForm.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Check the network details." }, 400);
    const n = body.data;
    const probe = await chain.probeNetwork(n.rpcUrl, n.registry as Address).catch(() => null);
    if (!probe) return c.json({ error: "No Legitfy registry answered at that RPC URL and address." }, 422);
    if (probe.chainId !== n.chainId) return c.json({ error: "That RPC URL is on a different chain ID." }, 422);
    if (probe.owner.toLowerCase() !== (await chain.platformOwner()).toLowerCase()) {
      return c.json({ error: "That registry must be owned by the current platform admin wallet." }, 422);
    }
    await db.query(
      `INSERT INTO settings (key, value) VALUES ('network', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(n)],
    );
    chain.useNetwork(n.rpcUrl, n.registry as Address);
    await syncInstitutions(db, chain);
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "network.updated", detail: n });
    return c.json(n);
  });

  /** A network is only listed once your own registry answers there, so the list can't overstate. */
  app.post("/platform/networks", platform, async (c) => {
    const body = NetworkForm.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Check the network details." }, 400);
    const n = body.data;
    const main = { ...deps.network, ...(await savedNetwork(db)) };
    const others = await extraNetworks(db);
    if (n.chainId === main.chainId || others.some((o) => o.chainId === n.chainId)) return c.json({ error: "That network is already listed." }, 409);
    if (others.length >= MAX_EXTRA_NETWORKS) return c.json({ error: "The network list is full." }, 409);
    const probe = await chain.probeNetwork(n.rpcUrl, n.registry as Address).catch(() => null);
    if (!probe) return c.json({ error: "No Legitfy registry answered at that RPC URL and address." }, 422);
    if (probe.chainId !== n.chainId) return c.json({ error: "That RPC URL is on a different chain ID." }, 422);
    if (probe.owner.toLowerCase() !== (await chain.platformOwner()).toLowerCase()) {
      return c.json({ error: "That registry must be owned by the current platform admin wallet." }, 422);
    }
    await saveExtraNetworks(db, [...others, n]);
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "network.added", detail: n });
    return c.json(n, 201);
  });

  app.delete("/platform/networks/:chainId", platform, async (c) => {
    const id = Number(c.req.param("chainId"));
    const others = await extraNetworks(db);
    if (!others.some((n) => n.chainId === id)) return c.json({ error: "Not found." }, 404);
    await saveExtraNetworks(db, others.filter((n) => n.chainId !== id));
    await appendAudit(db, { requestId: null, institutionId: null, actor: "platform", action: "network.removed", detail: { chainId: id } });
    return c.json({ ok: true });
  });

  app.post("/platform/networks/:chainId/logo", platform, uploadLimit, async (c) => {
    const id = Number(c.req.param("chainId"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Not found." }, 404);
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: "Upload the logo as a PNG or JPEG." }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) return c.json({ error: "Logos can be up to 1 MB." }, 413);
    const type = evidenceType(bytes);
    if (!type?.startsWith("image/")) return c.json({ error: "Upload the logo as a PNG or JPEG." }, 400);
    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath(`network-logo-${id}`), bytes);
    const logos = { ...(await networkLogos(db)), [id]: type };
    await db.query(
      "INSERT INTO settings (key, value) VALUES ('network_logos', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [JSON.stringify(logos)],
    );
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- platform

  app.get("/platform/overview", platform, async (c) => {
    const n = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0]?.n ?? 0);
    const institutions = await db.query(
      `SELECT i.id, i.name, i.active, i.admin, i.location,
        (SELECT count(*)::int FROM credentials c WHERE c.institution_id = i.id) AS documents,
        (SELECT count(*)::int FROM requests r WHERE r.institution_id = i.id) AS requests
       FROM institutions i ORDER BY i.id`,
    );
    return c.json({
      institutions: institutions.rows,
      documents: await n("SELECT count(*)::int AS n FROM credentials"),
      requests: await n("SELECT count(*)::int AS n FROM requests"),
      pendingApplications: await n("SELECT count(*)::int AS n FROM applications WHERE status = 'under_review'"),
    });
  });

  /** Re-reads chain after an on-chain change, then saves the off-chain location. */
  app.post("/platform/institutions/:id", platform, async (c) => {
    const body = z.object({ location: z.string().trim().max(120) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a location." }, 400);
    await syncInstitutions(db, chain);
    await db.query("UPDATE institutions SET location = $1 WHERE id = $2", [body.data.location, Number(c.req.param("id"))]);
    return c.json({ ok: true });
  });

  app.get("/inbox", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query(
      `SELECT id, requester_org, subject, status, level, priority, escalation_reason, assigned_to, due_at,
              registry_status, triage_status, triage->>'riskLevel' AS risk, created_at
       FROM requests WHERE institution_id = $1 AND status <> 'answered'
       ORDER BY (priority = 'high') DESC, due_at ASC LIMIT 200`,
      [s.institutionId],
    );
    return c.json(rows);
  });

  /**
   * The chain holds each day's fingerprint of the whole audit log, never the answer itself. That
   * log is hash-linked, so the first fingerprint on or after the answer's day covers it.
   */
  const chainRecord = async (answeredAt: Date | string | null) => {
    if (!answeredAt) return null;
    const day = Math.floor(new Date(answeredAt).getTime() / 86_400_000);
    const { rows } = await db.query<{ tx_hash: string | null; anchored_at: string }>(
      "SELECT tx_hash, anchored_at FROM audit_anchors WHERE day >= $1 ORDER BY day LIMIT 1", [day],
    );
    if (rows[0]) return { status: "anchored", txHash: rows[0].tx_hash, anchoredAt: rows[0].anchored_at };
    return { status: deps.anchoring ? "pending" : "off", txHash: null, anchoredAt: null };
  };

  app.get("/inbox/history", staff, async (c) => {
    const s = c.get("session");
    const { rows } = await db.query<Record<string, any>>(
      `SELECT r.id, r.requester_org, r.subject, r.level, r.answer_outcome, r.answered_by, r.answered_at,
              st.name AS answered_by_name, st.position AS answered_by_position
       FROM requests r LEFT JOIN staff st ON st.account = r.answered_by
       WHERE r.institution_id = $1 AND r.status = 'answered' ORDER BY r.answered_at DESC LIMIT 200`, [s.institutionId],
    );
    return c.json(await Promise.all(rows.map(async (r) => ({ ...r, chain: await chainRecord(r.answered_at) }))));
  });

  app.get("/requests/:id", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const { tracking_hash: _omit, ...safe } = r;
    const otherIssuer = r.registry_institution_id != null && r.registry_institution_id !== s.institutionId;
    const resolver = await db.query<{ name: string; position: string }>("SELECT name, position FROM staff WHERE account = $1", [r.answered_by]);
    return c.json({
      ...safe, registry_other_issuer: otherIssuer, chain: await chainRecord(r.answered_at),
      answered_by_name: resolver.rows[0]?.name ?? "", answered_by_position: resolver.rows[0]?.position ?? "",
    });
  });

  app.get("/requests/:id/file", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const blob = await readFile(filePath(r.id));
    await appendAudit(db, { requestId: r.id, institutionId: s.institutionId, actor: s.account, action: "file.viewed" });
    const plain = decryptFile(deps.fileMasterKey, s.institutionId, r.id, blob);
    return c.body(new Uint8Array(plain), 200, { "content-type": "application/pdf", "cache-control": "no-store" });
  });

  app.post("/requests/:id/claim", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const claimed = await db.query(
      "UPDATE requests SET assigned_to = $1, status = 'in_review' WHERE id = $2 AND status <> 'answered' RETURNING id",
      [s.account, r.id],
    );
    if (claimed.rows.length === 0) return c.json({ error: "This request has already been answered." }, 409);
    await appendAudit(db, { requestId: r.id, institutionId: s.institutionId, actor: s.account, action: "request.claimed" });
    return c.json({ ok: true });
  });

  app.post("/requests/:id/escalate", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    if (r.status === "answered") return c.json({ error: "This request has already been answered." }, 409);
    const body = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Say why you're escalating this." }, 400);
    const next = escalateForSla(r.level, new Date());
    if (!next) return c.json({ error: "This request is already at the top level." }, 409);
    await db.query(
      "UPDATE requests SET level = $1, due_at = $2, escalation_reason = $3, assigned_to = NULL WHERE id = $4",
      [next.level, next.dueAt.toISOString(), body.data.reason, r.id],
    );
    await appendAudit(db, {
      requestId: r.id, institutionId: s.institutionId, actor: s.account, action: "request.escalated",
      detail: { level: next.level, reason: body.data.reason },
    });
    return c.json({ level: next.level });
  });

  /** Only a signed-in person reaches this. The agent has no path to it. */
  app.post("/requests/:id/answer", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    if (r.status === "answered") return c.json({ error: "This request has already been answered." }, 409);
    if (s.level < r.level) return c.json({ error: "This request needs a higher level to answer." }, 403);
    const body = Answer.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Check the answer." }, 400);

    const answeredAt = new Date().toISOString();
    const receipt = sha256Hex(JSON.stringify([r.id, r.file_sha256, body.data.outcome, s.institutionId, s.account, answeredAt]));
    // Checked again in the write: two people answering at once must not both succeed.
    const saved = await db.query(
      `UPDATE requests SET status = 'answered', answer_outcome = $1, answer_note = $2, answered_by = $3,
         answered_at = $4, receipt_hash = $5 WHERE id = $6 AND status <> 'answered' RETURNING id`,
      [body.data.outcome, body.data.note, s.account, answeredAt, receipt, r.id],
    );
    if (saved.rows.length === 0) return c.json({ error: "This request has already been answered." }, 409);
    await appendAudit(db, {
      requestId: r.id, institutionId: s.institutionId, actor: s.account, action: "request.answered",
      detail: { outcome: body.data.outcome, receipt },
    });
    const issuer = await db.query<{ name: string }>("SELECT name FROM institutions WHERE id = $1", [s.institutionId]);
    await notify([r.requester_email], "requestAnswered", r.locale, { institution: issuer.rows[0]?.name });
    return c.json({ receipt });
  });

  app.get("/requests/:id/audit", staff, async (c) => {
    const s = c.get("session");
    const r = await ownRequest(c.req.param("id")!, s.institutionId);
    if (!r) return c.json({ error: "Not found." }, 404);
    const { rows } = await db.query(
      `SELECT a.actor, a.action, a.entry_hash, a.created_at, st.name AS actor_name
       FROM audit_log a LEFT JOIN staff st ON st.account = a.actor WHERE a.request_id = $1 ORDER BY a.seq`,
      [r.id],
    );
    return c.json(rows);
  });

  // -------------------------------------------------------------- sponsorship

  app.post("/sponsor", staff, async (c) => {
    const s = c.get("session");
    if (!deps.signSponsorship) return c.json({ error: "Gas sponsorship isn't set up yet." }, 503);
    const op = z.object({ sender: z.string(), callData: z.string() }).loose().safeParse(await c.req.json().catch(() => null));
    if (!op.success) return c.json({ error: "Send a UserOperation." }, 400);
    const sender = op.data.sender as Address;
    if (sender.toLowerCase() !== s.account.toLowerCase()) return c.json({ error: "denied", reason: "not_a_member" }, 403);

    const day = new Date().toISOString().slice(0, 10);
    const used = await db.query<{ count: number }>(
      "SELECT count FROM sponsorship_usage WHERE institution_id = $1 AND day = $2",
      [s.institutionId, day],
    );
    const denial = evaluateSponsorship({
      sender, callData: op.data.callData as Hex, registry: ((await savedNetwork(db)).registry ?? deps.registry) as Address,
      isActiveMember: await chain.canIssue(sender),
      usedToday: used.rows[0]?.count ?? 0, dailyQuota: deps.dailySponsorQuota,
    });
    if (denial) return c.json({ error: "denied", reason: denial }, 403);
    const signed = await deps.signSponsorship(op.data);
    await db.query(
      `INSERT INTO sponsorship_usage (institution_id, day, count) VALUES ($1, $2, 1)
       ON CONFLICT (institution_id, day) DO UPDATE SET count = sponsorship_usage.count + 1`,
      [s.institutionId, day],
    );
    return c.json(signed);
  });

  return app;
}

/**
 * Every institution has a seal from the moment it's approved. The design and colour counts share
 * no factor, so consecutive IDs give different pairs.
 */
function sealStyle(institutionId: number, saved: unknown) {
  const automatic = {
    design: SEAL_DESIGNS[institutionId % SEAL_DESIGNS.length],
    colour: SEAL_COLOURS[institutionId % SEAL_COLOURS.length],
  };
  const style = SealForm.safeParse({ ...automatic, ...(saved as object | null) });
  return style.success ? style.data : SealForm.parse(automatic);
}

/** Keeps the public directory in step with chain. */
export async function syncInstitutions(db: Db, chain: Chain) {
  for (const i of await chain.listInstitutions()) {
    await db.query(
      `INSERT INTO institutions (id, name, active, admin) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name = $2, active = $3, admin = $4`,
      [i.id, i.name, i.active, i.admin],
    );
  }
}

/** Moves overdue requests up the ladder. Returns how many moved. */
export async function runSlaSweep(db: Db, now = new Date()): Promise<number> {
  const { rows } = await db.query<{ id: string; institution_id: number; level: number }>(
    "SELECT id, institution_id, level FROM requests WHERE status <> 'answered' AND due_at < $1 AND level < 3",
    [now.toISOString()],
  );
  for (const r of rows) {
    const next = escalateForSla(r.level, now);
    if (!next) continue;
    await db.query(
      "UPDATE requests SET level = $1, due_at = $2, escalation_reason = $3, priority = 'high', assigned_to = NULL WHERE id = $4",
      [next.level, next.dueAt.toISOString(), next.reason, r.id],
    );
    await appendAudit(db, {
      requestId: r.id, institutionId: r.institution_id, actor: "system", action: "request.escalated",
      detail: { level: next.level, reason: next.reason },
    });
  }
  return rows.length;
}

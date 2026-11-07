import path from "node:path";
import { serve } from "@hono/node-server";
import Anthropic from "@anthropic-ai/sdk";
import type { Address, Hex } from "viem";
import { claudeTriager } from "./agent.js";
import { anchorYesterday, viemAnchor } from "./anchor.js";
import { resendMailer } from "./mail.js";
import { createApp, runSlaSweep, savedNetwork, syncInstitutions } from "./app.js";
import { viemChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { openDb, openPostgres } from "./db.js";

const config = loadConfig();
const db = config.DATABASE_URL ? await openPostgres(config.DATABASE_URL) : await openDb(path.join(config.DATA_DIR, "db"));
const chain = viemChain({
  rpcUrl: config.RPC_URL,
  registry: config.REGISTRY_ADDRESS as Address,
  factory: config.ACCOUNT_FACTORY as Address,
});

const saved = await savedNetwork(db);
if (saved.rpcUrl && saved.registry) chain.useNetwork(saved.rpcUrl, saved.registry as Address);

const app = createApp({
  db,
  chain,
  triager: config.ANTHROPIC_API_KEY ? claudeTriager(new Anthropic()) : null,
  sessionSecret: config.SESSION_SECRET,
  fileMasterKey: config.FILE_MASTER_KEY,
  dataDir: config.DATA_DIR,
  anchoring: Boolean(config.ANCHOR_ADDRESS && config.ANCHOR_PRIVATE_KEY),
  mailer: config.RESEND_API_KEY
    ? resendMailer({ apiKey: config.RESEND_API_KEY, from: config.MAIL_FROM, replyTo: config.MAIL_REPLY_TO })
    : undefined,
  webOrigin: config.WEB_ORIGIN,
  registry: config.REGISTRY_ADDRESS as Address,
  dailySponsorQuota: config.DAILY_SPONSOR_QUOTA,
  trustProxy: config.TRUST_PROXY,
  network: { name: "BOT Chain", chainId: config.CHAIN_ID, rpcUrl: config.RPC_URL, explorerUrl: config.EXPLORER_URL },
});

const sync = () => syncInstitutions(db, chain).catch((e) => console.error("institution sync failed", e));
await sync();
setInterval(sync, 5 * 60_000);
setInterval(() => runSlaSweep(db).catch((e) => console.error("sla sweep failed", e)), 10 * 60_000);

// In this process so it works the same on PGlite, where a second process on the folder loses writes.
if (config.ANCHOR_ADDRESS && config.ANCHOR_PRIVATE_KEY) {
  const target = viemAnchor({
    rpcUrl: config.RPC_URL, address: config.ANCHOR_ADDRESS as Address, privateKey: config.ANCHOR_PRIVATE_KEY as Hex,
  });
  const anchor = () => anchorYesterday(db, target).catch((e) => console.error("audit anchoring failed", e));
  await anchor();
  setInterval(anchor, 60 * 60_000);
}

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, () =>
  console.log(`legitify-api on ${config.HOST}:${config.PORT}`),
);

/** PGlite holds recent writes in memory, and Postgres connections should end cleanly. */
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

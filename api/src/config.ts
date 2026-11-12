import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("127.0.0.1"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATA_DIR: z.string().default("./.data"),
  /** Without this the API uses PGlite in DATA_DIR, which suits local development only. */
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  FILE_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, "64 hex chars"),
  CHAIN_ID: z.coerce.number().default(968),
  RPC_URL: z.string().default("https://rpc.bohr.life"),
  EXPLORER_URL: z.string().default("https://scan.botchain.ai"),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  ACCOUNT_FACTORY: z.string().default("0xBC88d6012b3bf8426C2851d3798cEB5257658332"),
  PAYMASTER_ADDRESS: z.string().optional(),
  PAYMASTER_SIGNER_PRIVATE_KEY: z.string().optional(),
  ANCHOR_ADDRESS: z.string().optional(),
  ANCHOR_PRIVATE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Without this the API sends no email, and everything else keeps working. */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("Legitfy <hello@mail.legitfy.dev>"),
  /** Where new applications are announced. Leave empty to send none. */
  PLATFORM_EMAIL: z.union([z.literal(""), z.email()]).optional(),
  MAIL_REPLY_TO: z.string().default("support@legitfy.dev"),
  DAILY_SPONSOR_QUOTA: z.coerce.number().default(500),
  TRUST_PROXY: z.stringbool().default(false),
});

export type Config = z.infer<typeof schema>;

/** Reads .env from the working directory. Variables already set in the environment win. */
export function loadConfig(): Config {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return schema.parse(process.env);
}

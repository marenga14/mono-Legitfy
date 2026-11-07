import { keccak256, toBytes, type Hex } from "viem";

/**
 * The ID people read, type and print: `UD-26-7K4Q9-XPM2C` is issuer, year, nine random symbols and
 * a check symbol. The on-chain ID is the code's hash, so anyone holding a code can look it up in the
 * registry directly, with no Legitfy server in between. The prefix is only a label: who issued a
 * certificate is always read from the registry.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O or U.
const SHAPE = /^([A-Z]{2,4})-?(\d{2})-?([0-9A-Z]{5})-?([0-9A-Z]{5})$/;
const FALLBACK_PREFIX = "LF";
const MINOR_WORDS = new Set(["OF", "THE", "AND", "FOR", "IN", "AT", "ES", "DE", "DES", "LA", "NA", "YA", "WA", "KWA", "CHA"]);

export function institutionPrefix(name: string): string {
  const words = name.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z]+/g, " ").trim()
    .split(" ").filter((w) => w && !MINOR_WORDS.has(w));
  const prefix = words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : (words[0] ?? "").slice(0, 3);
  return prefix.length >= 2 ? prefix : FALLBACK_PREFIX;
}

const checkSymbol = (prefix: string, year: string, random: string) =>
  ALPHABET[parseInt(keccak256(toBytes(`${prefix}${year}${random}`)).slice(2, 4), 16) % ALPHABET.length];

const format = (prefix: string, year: string, body: string) => `${prefix}-${year}-${body.slice(0, 5)}-${body.slice(5)}`;

export function newCertificateCode(institution: string, now = new Date()): string {
  const prefix = institutionPrefix(institution);
  const year = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return format(prefix, year, random + checkSymbol(prefix, year, random));
}

/** The exact code for anything a person might type, or null if it's mistyped. */
export function canonicalCode(input: string): string | null {
  const match = SHAPE.exec(input.replace(/\s/g, "").toUpperCase());
  if (!match) return null;
  const [, prefix, year, first, second] = match as unknown as [string, string, string, string, string];
  // Only the body avoids look-alikes, so the prefix must not be corrected the same way.
  const body = (first + second).replace(/O/g, "0").replace(/[IL]/g, "1");
  if ([...body].some((c) => !ALPHABET.includes(c))) return null;
  return checkSymbol(prefix, year, body.slice(0, 9)) === body[9] ? format(prefix, year, body) : null;
}

/** The API derives the same value: see `credentialIdFor` in api/src/chain.ts. */
export const credentialIdFor = (code: string): Hex => keccak256(toBytes(`legitify:credential:${code}`));

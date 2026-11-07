import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/** One key per institution, so a leak of one key exposes only that institution. */
function institutionKey(masterHex: string, institutionId: number): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(masterHex, "hex"), Buffer.alloc(0), `legitify:file:${institutionId}`, 32),
  );
}

/** Output layout: iv (12) | tag (16) | ciphertext. `aad` binds the blob to its request. */
export function encryptFile(masterHex: string, institutionId: number, aad: string, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", institutionKey(masterHex, institutionId), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptFile(masterHex: string, institutionId: number, aad: string, blob: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", institutionKey(masterHex, institutionId), blob.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

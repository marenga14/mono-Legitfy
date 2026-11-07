import { bytesToHex, type Hex } from "viem";

/** Runs entirely in the browser. The file is never uploaded for a public check. */
export async function sha256File(file: Blob): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

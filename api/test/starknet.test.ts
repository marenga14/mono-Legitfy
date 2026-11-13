import { CallData, byteArray, type Abi } from "starknet";
import { describe, expect, it } from "vitest";
import { decodeVerification } from "../src/starknet.js";
import built from "../src/starknet-registry.json" with { type: "json" };

describe("Starknet registry ABI", () => {
  it("parses a raw verify_by_hash answer into what decodeVerification reads", () => {
    const name = byteArray.byteArrayFromString("University of Dodoma, a name longer than one 31-byte word");
    const id = 2n ** 255n + 0xc0den; // needs the high half of the u256
    const file = 0xf11en;
    const felts = [
      "1", // status
      String(id & (2n ** 128n - 1n)), String(id >> 128n),
      String(name.data.length), ...name.data.map(String), String(name.pending_word), String(name.pending_word_len),
      "0x5ea1", "1", "1750000000", "0", "0", // issuer, institution, issued_at, reason, revoked_at
      String(file), "0", "0", "0", // file_hash, replaced_by
    ];
    const raw = new CallData(built.abi as Abi).parse("verify_by_hash", felts);
    expect(decodeVerification(raw as never)).toEqual({
      status: "authentic", credentialId: `0x${id.toString(16)}`, institution: "University of Dodoma, a name longer than one 31-byte word",
      issuedAt: "2025-06-15T15:06:40.000Z", revokedAt: null, revocationReason: null, replacedBy: null,
      fileHash: `0x${"f11e".padStart(64, "0")}`,
    });
  });
});

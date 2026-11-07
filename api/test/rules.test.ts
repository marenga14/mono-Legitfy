import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { decryptFile, encryptFile } from "../src/crypto.js";
import { escalateForSla, routeAfterTriage } from "../src/escalation.js";
import { evaluateSponsorship } from "../src/sponsorship.js";

const route = (o: Partial<Parameters<typeof routeAfterTriage>[0]>) =>
  routeAfterTriage({ level: 1, risk: "low", confidence: 0.9, registryStatus: "ok", ...o });

describe("routeAfterTriage", () => {
  it("leaves a clean read where it is", () => {
    expect(route({})).toEqual({ level: 1, priority: "normal", reason: null });
  });
  it("sends high risk to the registrar", () => {
    expect(route({ risk: "high" })).toMatchObject({ level: 2, priority: "high" });
  });
  it("sends unreadable documents up without marking them suspicious", () => {
    expect(route({ confidence: 0.2 })).toMatchObject({ level: 2, priority: "normal" });
  });
  it("treats a revoked credential as high priority even when the agent says low", () => {
    expect(route({ registryStatus: "revoked", risk: "low", confidence: 1 })).toMatchObject({ level: 2, priority: "high" });
  });
  it("sends a file another institution issued to the registrar, even when the agent says low", () => {
    expect(route({ otherIssuer: true, risk: "low", confidence: 1 })).toMatchObject({ level: 2, priority: "high" });
  });
  it("keeps the revoked reason when both apply", () => {
    expect(route({ otherIssuer: true, registryStatus: "revoked" }).reason).toMatch(/revoked/);
  });
  it("never lowers the level, whatever the document claims", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      expect(route({ level: 3, risk, confidence: 1 }).level).toBe(3);
    }
  });
});

describe("escalateForSla", () => {
  it("climbs one level at a time and stops at the top", () => {
    const now = new Date();
    expect(escalateForSla(1, now)?.level).toBe(2);
    expect(escalateForSla(2, now)?.level).toBe(3);
    expect(escalateForSla(3, now)).toBeNull();
  });
});

describe("file encryption", () => {
  const key = "11".repeat(32);
  it("round-trips", () => {
    const blob = encryptFile(key, 1, "req", Buffer.from("secret"));
    expect(blob.includes(Buffer.from("secret"))).toBe(false);
    expect(decryptFile(key, 1, "req", blob).toString()).toBe("secret");
  });
  it("cannot be read with another institution's key or moved to another request", () => {
    const blob = encryptFile(key, 1, "req", Buffer.from("secret"));
    expect(() => decryptFile(key, 2, "req", blob)).toThrow();
    expect(() => decryptFile(key, 1, "other", blob)).toThrow();
  });
});

describe("evaluateSponsorship", () => {
  const registry = "0x1111111111111111111111111111111111111111" as Address;
  const sender = "0x2222222222222222222222222222222222222222" as Address;
  const execute = parseAbi(["function execute(address dest, uint256 value, bytes func)"]);
  const reg = parseAbi(["function revoke(bytes32,uint8)", "function transferOwnership(address)"]);
  const revoke = encodeFunctionData({ abi: reg, functionName: "revoke", args: [`0x${"ab".repeat(32)}`, 1] });
  const call = (dest: Address, value: bigint, func: `0x${string}`) =>
    encodeFunctionData({ abi: execute, functionName: "execute", args: [dest, value, func] });
  const base = { sender, registry, isActiveMember: true, usedToday: 0, dailyQuota: 5, callData: call(registry, 0n, revoke) };

  it("approves a registry call from an active member", () => expect(evaluateSponsorship(base)).toBeNull());
  it("refuses non-members", () => expect(evaluateSponsorship({ ...base, isActiveMember: false })).toBe("not_a_member"));
  it("refuses over quota", () => expect(evaluateSponsorship({ ...base, usedToday: 5 })).toBe("quota_exceeded"));
  it("refuses other targets", () =>
    expect(evaluateSponsorship({ ...base, callData: call(sender, 0n, revoke) })).toBe("wrong_target"));
  it("refuses sending value", () =>
    expect(evaluateSponsorship({ ...base, callData: call(registry, 1n, revoke) })).toBe("value_not_allowed"));
  it("refuses registry functions outside the allowlist", () => {
    const func = encodeFunctionData({ abi: reg, functionName: "transferOwnership", args: [sender] });
    expect(evaluateSponsorship({ ...base, callData: call(registry, 0n, func) })).toBe("bad_call");
  });
  it("refuses garbage", () => expect(evaluateSponsorship({ ...base, callData: "0xdeadbeef" })).toBe("bad_call"));
});

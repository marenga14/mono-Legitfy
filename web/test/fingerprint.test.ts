import { describe, expect, it } from "vitest";
import { fingerprintPaths } from "../src/lib/fingerprint";

const HASH = "0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

describe("fingerprintPaths", () => {
  it("draws the same print for the same hash", () => {
    expect(fingerprintPaths(HASH)).toEqual(fingerprintPaths(HASH));
  });
  it("treats a hash the same with or without its prefix", () => {
    expect(fingerprintPaths(HASH.slice(2))).toEqual(fingerprintPaths(HASH));
  });
  it("changes when any single byte of the hash changes", () => {
    for (let byte = 0; byte < 32; byte++) {
      const at = 2 + byte * 2;
      const flipped = HASH.slice(0, at) + (HASH[at] === "0" ? "1" : "0") + HASH.slice(at + 1);
      expect(fingerprintPaths(flipped), `byte ${byte}`).not.toEqual(fingerprintPaths(HASH));
    }
  });
  it("keeps every ridge inside the drawing", () => {
    const points = fingerprintPaths(HASH).join("").match(/-?\d+\.\d+/g)!.map(Number);
    expect(Math.min(...points)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...points)).toBeLessThanOrEqual(200);
  });
  it("refuses anything that isn't a 32-byte hash", () => {
    expect(() => fingerprintPaths("0xabc")).toThrow();
  });
});

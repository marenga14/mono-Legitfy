import { describe, expect, it } from "vitest";
import { canonicalCode, credentialIdFor, institutionPrefix, newCertificateCode } from "../src/lib/certificateCode";

describe("certificate codes", () => {
  it("names the issuer from its initials", () => {
    expect(institutionPrefix("University of Dar es Salaam")).toBe("UDS");
    expect(institutionPrefix("Mzumbe University")).toBe("MU");
    expect(institutionPrefix("Muhimbili")).toBe("MUH");
    expect(institutionPrefix("École des Mines")).toBe("EM");
    expect(institutionPrefix("北京大学")).toBe("LF");
  });

  it("creates codes that read back unchanged", () => {
    for (let i = 0; i < 200; i++) {
      const code = newCertificateCode("University of Dar es Salaam", new Date("2026-11-07"));
      expect(code).toMatch(/^UDS-26-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(canonicalCode(code)).toBe(code);
    }
  });

  it("accepts the ways people retype a code", () => {
    const code = newCertificateCode("Mzumbe University", new Date("2026-11-07"));
    expect(canonicalCode(code.toLowerCase())).toBe(code);
    expect(canonicalCode(code.replace(/-/g, ""))).toBe(code);
    expect(canonicalCode(` ${code.replace(/-/g, " ")} `)).toBe(code);
  });

  it("treats look-alike symbols as the digits they resemble, in the body only", () => {
    for (let i = 0; i < 200; i++) {
      const code = newCertificateCode("Louis Institute", new Date("2026-11-07"));
      const typed = `LI-26-${code.slice(6).replace(/0/g, "O").replace(/1/g, () => (i % 2 ? "I" : "L"))}`;
      expect(canonicalCode(typed)).toBe(code);
    }
  });

  it("rejects a mistyped code", () => {
    expect(canonicalCode("not a code")).toBeNull();
    expect(canonicalCode(`0x${"ab".repeat(32)}`)).toBeNull();
    let caught = 0;
    for (let i = 0; i < 200; i++) {
      const code = newCertificateCode("Mzumbe University");
      const swapped = code.slice(0, -2) + (code.at(-2) === "A" ? "B" : "A") + code.at(-1);
      if (canonicalCode(swapped) === null) caught++;
    }
    expect(caught).toBeGreaterThan(170); // One symbol catches about 31 in 32.
  });

  it("hashes to the on-chain ID the API derives", () => {
    expect(credentialIdFor("UD-26-7K4Q9-XPM2C")).toBe("0x30bd3254f2da77378bb4e9149befcf14514fdb3f1bbb4dd967c0553070340d27");
  });
});

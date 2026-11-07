import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/locales/en";
import { serverErrors } from "../src/locales/server";
import sw from "../src/locales/sw";
import zh from "../src/locales/zh";

type Tree = { [key: string]: string | Tree };
const flatten = (tree: Tree, prefix = ""): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...all, [name]: value } : { ...all, ...flatten(value, name) };
  }, {});
const words = flatten(en);
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|vue)$/.test(name) ? [full] : [];
  });
const root = path.resolve(__dirname, "..");
const code = sourceFiles(path.join(root, "src")).filter((f) => !f.includes("/locales/")).map((f) => readFileSync(f, "utf8")).join("\n");

describe.each([["zh", zh], ["sw", sw]] as const)("%s translation", (_, messages) => {
  const translated = flatten(messages);
  it("has every key and no extras", () => {
    expect(Object.keys(translated).sort()).toEqual(Object.keys(words).sort());
  });
  it("keeps every placeholder", () => {
    for (const [key, text] of Object.entries(words)) expect(placeholders(translated[key]!), key).toEqual(placeholders(text));
  });
  it("leaves nothing empty", () => {
    for (const [key, text] of Object.entries(translated)) expect(text.trim(), key).not.toBe("");
  });
});

describe("source code", () => {
  it("only asks for keys that exist", () => {
    const used = [...code.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(150);
    for (const key of used) expect(words, key).toHaveProperty([key]);
  });
});

describe("server messages", () => {
  const api = readFileSync(path.join(root, "../api/src/app.ts"), "utf8");
  const messages = [...api.matchAll(/(?:error|message): "([^"]+)"/g), ...api.matchAll(/\?\? "([A-Z][^"]+)"/g)].map((m) => m[1]!).filter((m) => m !== "denied");
  it("are all translated", () => {
    expect(messages.length).toBeGreaterThan(30);
    for (const message of messages) expect(serverErrors, message).toHaveProperty([message]);
  });
});

describe("brand name", () => {
  it('is spelled "Legitfy" in every language', () => {
    const all = JSON.stringify([en, sw, zh, serverErrors]);
    expect(all).toContain("Legitfy");
    expect(all.toLowerCase()).not.toContain("legitify");
  });
});

describe("Swahili wording", () => {
  it('says "akaunti" for a wallet, never "pochi"', () => {
    const all = JSON.stringify([sw, Object.values(serverErrors).map((e) => e.sw)]);
    expect(all.toLowerCase()).not.toContain("pochi");
  });
});

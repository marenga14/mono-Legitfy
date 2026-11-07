import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? vueFiles(full) : name.endsWith(".vue") ? [full] : [];
  });

describe("scoped styles", () => {
  // Vue compiles `:global(a) .b` to just `a`, so the rule lands on the page root instead of `.b`.
  it("never follow :global() with another selector", () => {
    for (const file of vueFiles(path.resolve(__dirname, "../src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/:global\([^)]*\)\s*[^\s{,]/);
    }
  });
});

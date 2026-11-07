import { describe, expect, it } from "vitest";
import { findIdColumn, parseCsv, runChecks } from "../src/lib/bulkCheck";

const isId = (v: string) => /^UD-26-/.test(v);

describe("bulk checks", () => {
  it("reads CSV files as spreadsheets save them", () => {
    expect(parseCsv('﻿Name,ID\r\n"Mushi, Asha",UD-26-1\r\n\r\n"He said ""hi""",UD-26-2')).toEqual([
      ["Name", "ID"], ["Mushi, Asha", "UD-26-1"], ['He said "hi"', "UD-26-2"],
    ]);
    expect(parseCsv("Name;ID\nAsha;UD-26-1")).toEqual([["Name", "ID"], ["Asha", "UD-26-1"]]);
  });

  it("finds the ID column wherever it is", () => {
    expect(findIdColumn([["Name", "Ref"], ["Asha", "UD-26-1"], ["Juma", "UD-26-2"]], isId)).toEqual({ column: 1, hasHeader: true });
    expect(findIdColumn([["UD-26-1"], ["UD-26-2"]], isId)).toEqual({ column: 0, hasHeader: false });
  });

  it("uses the heading when every ID is mistyped", () => {
    expect(findIdColumn([["Name", "Certificate ID"], ["Asha", "nonsense"]], isId)).toEqual({ column: 1, hasHeader: true });
    expect(findIdColumn([["nonsense"], ["typo"]], isId)).toEqual({ column: 0, hasHeader: false });
  });

  it("keeps results in order however long each check takes", async () => {
    const seen: number[] = [];
    const results = await runChecks([30, 1, 10, 5, 2, 8], async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms * 2;
    }, (n) => seen.push(n));
    expect(results).toEqual([60, 2, 20, 10, 4, 16]);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

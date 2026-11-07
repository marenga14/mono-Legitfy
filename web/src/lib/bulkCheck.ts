export const MAX_ROWS = 1000;
export const MAX_FILES = 50;
const CONCURRENT_CHECKS = 4;
const ID_HEADER = /certificate|cert|\bid\b|namba|kitambulisho|证书|编号/i;

export type Cell = string;
export type BulkStatus = "authentic" | "revoked" | "replaced" | "suspended" | "not_found" | "invalid" | "not_checked";
export interface BulkResult { status: BulkStatus; institution: string; issued: string; network: string; currentVersion: string }

export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  const delimiter = (source.split("\n", 1)[0] ?? "").includes(";") && !(source.split("\n", 1)[0] ?? "").includes(",") ? ";" : ",";
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, "")]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** The column holding the most real IDs wins, so no particular heading or order is needed. */
export function findIdColumn(rows: Cell[][], isId: (value: string) => boolean): { column: number; hasHeader: boolean } {
  const first = rows[0] ?? [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const counts = Array.from({ length: width }, (_, column) => rows.filter((r) => isId(r[column] ?? "")).length);
  const best = Math.max(0, ...counts);
  const named = first.findIndex((cell) => ID_HEADER.test(cell));
  const column = best > 0 ? counts.indexOf(best) : Math.max(named, 0);
  return { column, hasHeader: !isId(first[column] ?? "") && (best > 0 || named >= 0) };
}

/** Runs a few at a time, so a long list doesn't flood the network's public RPC. */
export async function runChecks<T, R>(items: T[], check: (item: T) => Promise<R>, onDone: (finished: number) => void): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let finished = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_CHECKS, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await check(items[index]!);
      onDone(++finished);
    }
  }));
  return results;
}

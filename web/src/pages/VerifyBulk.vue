<script setup lang="ts">
import { computed, ref } from "vue";
import { MAX_FILES, MAX_ROWS, findIdColumn, parseCsv, runChecks, type BulkResult, type BulkStatus, type Cell } from "../lib/bulkCheck";
import { sha256File } from "../lib/hash";
import { dateLocale, t } from "../lib/i18n";
import { resolveCredential, verifyByHash, verifyById, type Verdict } from "../lib/registry";

interface Line { label: string; result: BulkResult }
const total = ref(0);
const finished = ref(0);
const running = ref(false);
const error = ref("");
const lines = ref<Line[]>([]);
/** The columns to write back, so the person gets their own sheet with results added. */
let header: Cell[] = [];
let originals: Cell[][] = [];

const counts = computed(() => {
  const all: Partial<Record<BulkStatus, number>> = {};
  for (const { result } of lines.value) all[result.status] = (all[result.status] ?? 0) + 1;
  return Object.entries(all) as [BulkStatus, number][];
});
const isoDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";
const fromVerdict = (v: Verdict): BulkResult => ({
  status: v.status, institution: v.status === "not_found" ? "" : v.institution, issued: isoDate(v.issuedAt),
  network: v.status === "not_found" ? "" : v.network, currentVersion: v.replacedBy ?? "",
});
const empty = (status: BulkStatus): BulkResult => ({ status, institution: "", issued: "", network: "", currentVersion: "" });
/** A failed read isn't "no record": that network could hold the certificate. */
const lookUp = (read: () => Promise<Verdict>) => read().then(fromVerdict).catch(() => empty("not_checked"));

function reset(count: number) {
  error.value = "";
  lines.value = [];
  total.value = count;
  finished.value = 0;
  running.value = true;
}

async function readRows(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  return rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())))
    .filter((row) => row.some(Boolean));
}

async function checkList(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  error.value = "";
  let rows: Cell[][];
  try {
    rows = await readRows(file);
  } catch {
    error.value = t("bulk.unreadable");
    return;
  }
  const { column, hasHeader } = findIdColumn(rows, (value) => Boolean(resolveCredential(value)));
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length === 0) return void (error.value = t("bulk.noRows"));
  if (body.length > MAX_ROWS) return void (error.value = t("bulk.tooManyRows", { max: MAX_ROWS }));
  reset(body.length);
  header = hasHeader ? rows[0]! : [t("document.id")];
  originals = hasHeader ? body : body.map((row) => [row[column] ?? ""]);
  const results = await runChecks(body, async (row) => {
    const target = resolveCredential(row[column] ?? "");
    return target ? lookUp(() => verifyById(target.id)) : empty("invalid");
  }, (n) => (finished.value = n));
  lines.value = body.map((row, i) => ({ label: row[column] ?? "", result: results[i]! }));
  running.value = false;
}

async function checkFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length === 0) return;
  if (files.length > MAX_FILES) return void (error.value = t("bulk.tooManyFiles", { max: MAX_FILES }));
  reset(files.length);
  const results = await runChecks(files, async (file) => {
    const hash = await sha256File(file);
    return { hash, result: await lookUp(() => verifyByHash(hash)) };
  }, (n) => (finished.value = n));
  header = [t("bulk.fileName"), t("verify.fingerprintLabel").replace(/:\s*$/, "")];
  originals = files.map((file, i) => [file.name, results[i]!.hash]);
  lines.value = files.map((file, i) => ({ label: file.name, result: results[i]!.result }));
  running.value = false;
}

const label = (status: BulkStatus) => t(`bulk.status.${status}`);
const shownDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { dateStyle: "medium" }) : "");

async function download() {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const columns = [...header, t("bulk.result"), t("bulk.issuedBy"), t("bulk.issued"), t("bulk.network"), t("bulk.currentVersion")];
  const width = Math.max(header.length, ...originals.map((row) => row.length));
  const pad = (row: Cell[]) => [...row, ...new Array<string>(width - row.length).fill("")];
  const rows = lines.value.map(({ result }, i) => [
    ...pad(originals[i]!), label(result.status), result.institution, result.issued, result.network, result.currentVersion,
  ]);
  const head = [...pad(header), ...columns.slice(header.length)];
  // Every cell is written as text, so nothing from an uploaded sheet can run as a formula.
  await writeExcelFile([
    head.map((value) => ({ value, type: String, fontWeight: "bold" as const })),
    ...rows.map((row) => row.map((value) => ({ value, type: String }))),
  ]).toFile("legitfy-check-results.xlsx");
}
</script>

<template>
  <section class="mx-auto max-w-4xl px-6 py-10">
    <h1 class="text-center text-5xl">{{ t("bulk.title") }}</h1>
    <p class="mx-auto mt-4 max-w-prose text-center text-ink-soft">{{ t("bulk.body") }}</p>
    <div class="mt-8 grid gap-4 sm:grid-cols-2">
      <label class="glass block p-6">
        <span class="text-xl font-semibold">{{ t("bulk.listTitle") }}</span>
        <span class="mt-2 block text-sm text-ink-soft">{{ t("bulk.listHint", { max: MAX_ROWS }) }}</span>
        <input type="file" accept=".xlsx,.csv" class="field mt-3" :disabled="running" @change="checkList" />
      </label>
      <label class="glass block p-6">
        <span class="text-xl font-semibold">{{ t("bulk.filesTitle") }}</span>
        <span class="mt-2 block text-sm text-ink-soft">{{ t("bulk.filesHint", { max: MAX_FILES }) }}</span>
        <input type="file" accept="application/pdf" multiple class="field mt-3" :disabled="running" @change="checkFiles" />
      </label>
    </div>
    <p class="mt-3 text-center text-sm text-ink-soft">{{ t("bulk.privacy") }}</p>
    <p v-if="error" class="mt-4 text-center text-seal" role="alert">{{ error }}</p>
    <p v-if="running" class="mt-6 text-center" role="status">{{ t("bulk.progress", { done: finished, total }) }}</p>

    <template v-if="lines.length && !running">
      <div class="glass mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <p role="status">
          <span v-for="[status, count] in counts" :key="status" class="mr-4 inline-block"><strong>{{ count }}</strong> {{ label(status) }}</span>
        </p>
        <button class="btn" data-testid="bulk-download" @click="download">{{ t("bulk.download") }}</button>
      </div>
      <p class="mt-3 text-sm text-ink-soft">{{ t("bulk.notFake") }}</p>
      <div class="glass mt-3 overflow-x-auto" tabindex="0" role="region" :aria-label="t('bulk.title')">
        <table class="w-full text-left text-sm">
          <thead><tr><th class="p-3">{{ t("bulk.item") }}</th><th class="p-3">{{ t("bulk.result") }}</th><th class="p-3">{{ t("bulk.issuedBy") }}</th><th class="p-3">{{ t("bulk.issued") }}</th></tr></thead>
          <tbody>
            <tr v-for="(line, i) in lines" :key="i" class="border-t border-line">
              <td class="hash max-w-64 truncate p-3" :title="line.label">{{ line.label }}</td>
              <td class="p-3 font-semibold">{{ label(line.result.status) }}</td>
              <td class="p-3">{{ line.result.institution }}</td>
              <td class="whitespace-nowrap p-3">{{ shownDate(line.result.issued) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

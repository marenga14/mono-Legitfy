<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import ChainRecord, { type ChainProof } from "../components/console/ChainRecord.vue";
import PageHead from "../components/console/PageHead.vue";
import { api } from "../lib/api";
import { shortId } from "../lib/certificate";
import { dateLocale, t } from "../lib/i18n";
import { OUTCOMES } from "../lib/outcomes";

interface Row {
  id: string; requester_org: string; subject: string; status: string; level: number; priority: string;
  escalation_reason: string | null; due_at: string; registry_status: string; risk: string | null;
}
interface Resolved {
  id: string; requester_org: string; subject: string; answer_outcome: string; answered_by: string; answered_at: string;
  answered_by_name: string | null; chain: ChainProof;
}
interface Me { institution: string; role: string; level: number; agentEnabled: boolean }

const level = (n: number) => t(`levels.${n}`);
const rows = ref<Row[] | null>(null);
const resolved = ref<Resolved[] | null>(null);
const tab = ref<"open" | "resolved">("open");
const me = ref<Me | null>(null);
const error = ref("");

async function load() {
  try {
    [me.value, rows.value, resolved.value] = await Promise.all([api<Me>("/me"), api<Row[]>("/inbox"), api<Resolved[]>("/inbox/history")]);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

const urgent = computed(() => (rows.value ?? []).filter((r) => r.priority === "high").length);
const when = (d: string) => new Date(d).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" });
const due = (d: string) => {
  const hours = Math.round((new Date(d).getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return t("inbox.overdue", { n: -hours });
  return hours < 48 ? t("inbox.dueHours", { n: hours }) : t("inbox.dueDays", { n: Math.round(hours / 24) });
};
</script>

<template>
  <PageHead :title="t('inbox.title')">
    <p v-if="me" class="text-ink-soft">{{ t("inbox.levelSuffix", { level: level(me.level) }) }}</p>
  </PageHead>
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <div class="mt-4 flex gap-2" role="tablist" :aria-label="t('inbox.title')">
    <button
      v-for="name in (['open', 'resolved'] as const)" :key="name" type="button" role="tab" :aria-selected="tab === name"
      :class="['btn', tab !== name && 'btn-quiet']" @click="tab = name"
    >{{ t(`inbox.tabs.${name}`) }} ({{ (name === "open" ? rows : resolved)?.length ?? 0 }})</button>
  </div>
  <template v-if="tab === 'open'">
  <p v-if="rows && rows.length === 0" class="panel mt-4 p-6">{{ t("inbox.empty") }}</p>
  <p v-else-if="urgent" class="mt-4 font-semibold text-seal">{{ t(urgent === 1 ? "inbox.urgentOne" : "inbox.urgentMany", { n: urgent }) }}</p>
  <div v-if="rows?.length" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('inbox.requests')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("inbox.no") }}</th><th>{{ t("inbox.subject") }}</th><th>{{ t("inbox.from") }}</th><th>{{ t("inbox.due") }}</th><th>{{ t("inbox.level") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="r.id">
          <td>{{ i + 1 }}</td>
          <td>
            <span class="font-semibold">{{ r.subject }}</span>
            <span v-if="r.escalation_reason" class="block text-sm text-ink-soft">{{ r.escalation_reason }}</span>
          </td>
          <td>{{ r.requester_org }}</td>
          <td :class="['whitespace-nowrap', r.priority === 'high' && 'font-semibold text-seal']">{{ due(r.due_at) }}</td>
          <td class="whitespace-nowrap">{{ level(r.level) }}<template v-if="r.status === 'in_review'">, {{ t("inbox.inReview") }}</template></td>
          <td><RouterLink :to="`/app/requests/${r.id}`" class="btn btn-view" :aria-label="t('inbox.viewItem', { name: r.subject })">{{ t("common.view") }}</RouterLink></td>
        </tr>
      </tbody>
    </table>
  </div>
  </template>
  <template v-else>
    <p v-if="resolved?.length === 0" class="panel mt-4 p-6">{{ t("inbox.noneResolved") }}</p>
    <template v-else-if="resolved">
      <div class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('inbox.tabs.resolved')">
        <table class="data-table">
          <thead class="bg-gradient"><tr><th>{{ t("inbox.subject") }}</th><th>{{ t("inbox.from") }}</th><th>{{ t("inbox.outcome") }}</th><th>{{ t("inbox.resolvedBy") }}</th><th>{{ t("inbox.resolvedAt") }}</th><th>{{ t("inbox.onChain") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
          <tbody>
            <tr v-for="r in resolved" :key="r.id">
              <td class="font-semibold">{{ r.subject }}</td>
              <td>{{ r.requester_org }}</td>
              <td class="whitespace-nowrap">{{ t(OUTCOMES[r.answer_outcome]!) }}</td>
              <td :class="!r.answered_by_name && 'hash'" :title="r.answered_by">{{ r.answered_by_name || shortId(r.answered_by) }}</td>
              <td class="whitespace-nowrap">{{ when(r.answered_at) }}</td>
              <td><ChainRecord :chain="r.chain" /></td>
              <td><RouterLink :to="`/app/requests/${r.id}`" class="btn btn-view" :aria-label="t('inbox.viewItem', { name: r.subject })">{{ t("common.view") }}</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 max-w-prose text-sm text-ink-soft">{{ t("inbox.chainNote") }}</p>
    </template>
  </template>
</template>

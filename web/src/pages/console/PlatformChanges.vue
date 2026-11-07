<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { longDate } from "../../lib/certificate";
import { t } from "../../lib/i18n";

interface Change { id: string; institution: string; field: string; old_value: string; new_value: string; reason: string; created_at: string }
const rows = ref<Change[] | null>(null);
const error = ref("");
const busy = ref(false);
const urls = reactive<Record<string, string>>({});
const reasons = reactive<Record<string, string>>({});

async function load() {
  rows.value = await api("/platform/changes");
}
onMounted(() => load().catch((e) => (error.value = e.message)));
onBeforeUnmount(() => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)));

const shown = (c: Change, value: string) =>
  c.field === "institution_type" && value ? t(`applications.types.${value}`) : value || t("profile.notRecorded");

async function attempt(work: () => Promise<unknown>) {
  error.value = "";
  busy.value = true;
  try {
    await work();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
const view = (id: string) => attempt(async () => {
  urls[id] = URL.createObjectURL(await api<Blob>(`/platform/changes/${id}/file`));
});
const approve = (id: string) => attempt(async () => {
  await api(`/platform/changes/${id}/approve`, { method: "POST", body: "{}" });
  await load();
});
const reject = (id: string) => attempt(async () => {
  await api(`/platform/changes/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: reasons[id] ?? "" }) });
  await load();
});
</script>

<template>
  <PageHead :title="t('changes.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <p v-if="rows?.length === 0" class="panel mt-4 p-6 text-ink-soft">{{ t("changes.empty") }}</p>
  <article v-for="c in rows" :key="c.id" class="panel mt-4 space-y-3 p-5">
    <h2 class="text-lg">{{ c.institution }}</h2>
    <p class="text-sm text-ink-soft">{{ longDate(c.created_at) }}</p>
    <dl class="grid gap-3 sm:grid-cols-3">
      <div><dt class="text-sm font-semibold">{{ t("changes.detail") }}</dt><dd>{{ t(`profile.fields.${c.field}`) }}</dd></div>
      <div><dt class="text-sm font-semibold">{{ t("changes.current") }}</dt><dd>{{ shown(c, c.old_value) }}</dd></div>
      <div><dt class="text-sm font-semibold">{{ t("changes.requested") }}</dt><dd>{{ shown(c, c.new_value) }}</dd></div>
      <div class="sm:col-span-3"><dt class="text-sm font-semibold">{{ t("profile.reason") }}</dt><dd>{{ c.reason }}</dd></div>
    </dl>
    <a v-if="urls[c.id]" class="btn btn-quiet" :href="urls[c.id]" target="_blank" rel="noopener">{{ t("changes.openEvidence") }}</a>
    <button v-else class="btn btn-quiet" :disabled="busy" @click="view(c.id)">{{ t("changes.loadEvidence") }}</button>
    <p class="text-sm text-ink-soft">{{ t("changes.checkNote") }}</p>
    <button class="btn" :disabled="busy || !urls[c.id]" @click="approve(c.id)">{{ t("changes.approve") }}</button>
    <form class="space-y-2" @submit.prevent="reject(c.id)">
      <label class="block">{{ t("changes.rejectReason") }}<textarea v-model="reasons[c.id]" class="field mt-1" rows="2" required minlength="3" maxlength="1000"></textarea></label>
      <button class="btn btn-quiet" :disabled="busy">{{ t("changes.reject") }}</button>
    </form>
  </article>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { Overview } from "./platform";

const data = ref<Overview | null>(null);
const error = ref("");
onMounted(async () => {
  try {
    data.value = await api("/platform/overview");
  } catch (e) {
    error.value = (e as Error).message;
  }
});
const cards = computed(() => {
  const d = data.value;
  return d ? [
    { name: t("platform.institutions"), number: d.institutions.length },
    { name: t("platform.active"), number: d.institutions.filter((i) => i.active).length },
    { name: t("platform.documents"), number: d.documents },
    { name: t("platform.requests"), number: d.requests },
  ] : [];
});
</script>

<template>
  <PageHead :title="t('platform.dashboard')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <RouterLink v-if="data?.pendingApplications" to="/app/platform/applications" class="console-banner mt-4 block p-4 font-semibold">{{ t("platform.pending", { n: data.pendingApplications }) }}</RouterLink>
  <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div v-for="c in cards" :key="c.name" class="panel stat-card overflow-hidden">
      <p class="border-b border-line bg-wash px-4 py-2.5 font-semibold text-harbour">{{ c.name }}</p>
      <p class="py-6 text-center text-6xl font-extrabold"><span class="text-verifiable">{{ c.number.toLocaleString() }}</span></p>
    </div>
  </div>
  <div v-if="data" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('platform.institutions')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("common.no") }}</th><th>{{ t("platform.institution") }}</th><th>{{ t("platform.location") }}</th><th>{{ t("common.status") }}</th><th>{{ t("platform.documents") }}</th><th>{{ t("platform.requests") }}</th></tr></thead>
      <tbody>
        <tr v-for="(i, n) in data.institutions" :key="i.id">
          <td>{{ n + 1 }}</td><td>{{ i.name }}</td><td>{{ i.location }}</td><td>{{ i.active ? t("platform.active") : t("platform.suspended") }}</td><td>{{ i.documents }}</td><td>{{ i.requests }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

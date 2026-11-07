<script setup lang="ts">
import { onMounted, ref } from "vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { longDate } from "../../lib/certificate";
import { t } from "../../lib/i18n";

interface Row { id: string; institution_name: string; country: string; applicant_name: string; status: string; created_at: string }
const rows = ref<Row[] | null>(null);
const error = ref("");
onMounted(async () => {
  try {
    rows.value = await api("/platform/applications");
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<template>
  <PageHead :title="t('applications.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <p v-if="rows?.length === 0" class="panel mt-4 p-6 text-ink-soft">{{ t("applications.empty") }}</p>
  <div v-else-if="rows" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('applications.title')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("common.no") }}</th><th>{{ t("platform.institution") }}</th><th>{{ t("apply.country") }}</th><th>{{ t("applications.applicant") }}</th><th>{{ t("applications.received") }}</th><th>{{ t("common.status") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
      <tbody>
        <tr v-for="(a, n) in rows" :key="a.id">
          <td>{{ n + 1 }}</td><td>{{ a.institution_name }}</td><td>{{ a.country }}</td><td>{{ a.applicant_name }}</td><td>{{ longDate(a.created_at) }}</td>
          <td>{{ t(`applications.status.${a.status}`) }}</td>
          <td><RouterLink :to="`/app/platform/applications/${a.id}`" class="btn btn-view" :aria-label="t('inbox.viewItem', { name: a.institution_name })">{{ t("common.view") }}</RouterLink></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

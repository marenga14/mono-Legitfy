<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import type { Address } from "viem";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { shortId } from "../../lib/certificate";
import { t } from "../../lib/i18n";
import { registryStats } from "../../lib/registry";
import { registerInstitution, setInstitutionActive } from "../../lib/wallet";
import type { Institution, Overview } from "./platform";

const rows = ref<Institution[] | null>(null);
const error = ref("");
const busy = ref<number | "new" | null>(null);
const form = reactive({ name: "", admin: "", location: "" });

async function load() {
  rows.value = (await api<Overview>("/platform/overview")).institutions;
}
async function attempt(key: number | "new", work: () => Promise<void>) {
  error.value = "";
  busy.value = key;
  try {
    await work();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = null;
  }
}
onMounted(() => load().catch((e) => (error.value = e.message)));

/** This call also makes the API re-read the chain, so the table picks up the change. */
const saveLocation = (id: number, location: string) =>
  api(`/platform/institutions/${id}`, { method: "POST", body: JSON.stringify({ location }) });

const register = () => attempt("new", async () => {
  await registerInstitution(form.name, form.admin as Address);
  await saveLocation((await registryStats()).institutions, form.location);
  Object.assign(form, { name: "", admin: "", location: "" });
});
const toggle = (i: Institution) => attempt(i.id, async () => {
  await setInstitutionActive(i.id, !i.active);
  await saveLocation(i.id, i.location);
});
</script>

<template>
  <PageHead :title="t('platform.institutions')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <div v-if="rows" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('platform.institutions')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("common.no") }}</th><th>{{ t("platform.institution") }}</th><th>{{ t("platform.location") }}</th><th>{{ t("platform.adminWallet") }}</th><th>{{ t("common.status") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
      <tbody>
        <tr v-for="(i, n) in rows" :key="i.id">
          <td>{{ n + 1 }}</td>
          <td>{{ i.name }}</td>
          <td><input v-model="i.location" class="field min-h-9! w-44 py-1!" :aria-label="t('platform.locationOf', { name: i.name })" maxlength="120" @change="attempt(i.id, async () => { await saveLocation(i.id, i.location); })" /></td>
          <td class="hash" :title="i.admin">{{ shortId(i.admin) }}</td>
          <td>{{ i.active ? t("platform.active") : t("platform.suspended") }}</td>
          <td><button class="btn btn-view" :disabled="busy === i.id" @click="toggle(i)">{{ busy === i.id ? t("common.waitingWallet") : i.active ? t("platform.suspend") : t("platform.reactivate") }}</button></td>
        </tr>
      </tbody>
    </table>
  </div>
  <form class="panel mt-4 grid gap-4 p-5 sm:grid-cols-3" @submit.prevent="register">
    <h2 class="text-lg sm:col-span-3">{{ t("platform.register") }}</h2>
    <label>{{ t("platform.name") }}<input v-model="form.name" class="field mt-1" required minlength="2" /></label>
    <label>{{ t("platform.location") }}<input v-model="form.location" class="field mt-1" maxlength="120" /></label>
    <label>{{ t("platform.adminWallet") }}<input v-model="form.admin" class="field mt-1 hash" required pattern="0x[0-9a-fA-F]{40}" :title="t('common.walletPattern')" /></label>
    <div class="sm:col-span-3"><button class="btn" :disabled="busy === 'new'">{{ busy === "new" ? t("common.waitingWallet") : t("platform.submit") }}</button></div>
  </form>
</template>

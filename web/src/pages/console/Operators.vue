<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import type { Address } from "viem";
import PageHead from "../../components/console/PageHead.vue";
import { api, ApiError } from "../../lib/api";
import { shortId } from "../../lib/certificate";
import { t } from "../../lib/i18n";
import { addOperator, canWrite } from "../../lib/wallet";

interface Member { account: string; name: string; position: string; level: number; role: string }
const rows = ref<Member[] | null>(null);
const error = ref("");
const busy = ref(false);
const form = reactive({ name: "", account: "", position: "" });

async function load() {
  try {
    rows.value = await api("/staff");
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

const save = () => api("/staff", { method: "POST", body: JSON.stringify(form) });
async function add() {
  error.value = "";
  busy.value = true;
  try {
    // The API refuses a wallet that isn't a member yet, which tells us the chain step is needed.
    await save().catch(async (e) => {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      await addOperator(form.account as Address);
      await save();
    });
    Object.assign(form, { name: "", account: "", position: "" });
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function setLevel(m: Member, level: number) {
  error.value = "";
  try {
    await api(`/staff/${m.account}/level`, { method: "PUT", body: JSON.stringify({ level }) });
    m.level = level;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <PageHead :title="t('operators.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <div v-if="rows" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('operators.title')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("operators.no") }}</th><th>{{ t("operators.name") }}</th><th>{{ t("operators.position") }}</th><th>{{ t("operators.wallet") }}</th><th>{{ t("operators.role") }}</th><th>{{ t("operators.level") }}</th></tr></thead>
      <tbody>
        <tr v-for="(m, i) in rows" :key="m.account">
          <td>{{ i + 1 }}</td>
          <td>{{ m.name || t("operators.noName") }}</td>
          <td>{{ m.position }}</td>
          <td class="hash" :title="m.account">{{ shortId(m.account) }}</td>
          <td>{{ t(`operators.roles.${m.role}`) }}</td>
          <td>
            <template v-if="m.role === 'admin'">{{ t("levels.3") }}</template>
            <select v-else class="field min-h-9! w-36 py-1!" :aria-label="t('operators.levelFor', { name: m.name || m.account })" :value="m.level" @change="setLevel(m, Number(($event.target as HTMLSelectElement).value))">
              <option v-for="level in [1, 2, 3]" :key="level" :value="level">{{ t(`levels.${level}`) }}</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <form class="panel mt-4 grid gap-4 p-5 sm:grid-cols-3" @submit.prevent="add">
    <h2 class="text-lg sm:col-span-3">{{ t("operators.add") }}</h2>
    <label>{{ t("operators.name") }}<input v-model="form.name" class="field mt-1" required minlength="2" maxlength="120" /></label>
    <label>{{ t("operators.position") }}<input v-model="form.position" class="field mt-1" maxlength="120" /></label>
    <label>{{ t("operators.walletAddress") }}<input v-model="form.account" class="field mt-1 hash" required pattern="0x[0-9a-fA-F]{40}" :title="t('common.walletPattern')" /></label>
    <div class="flex flex-wrap items-center gap-3 sm:col-span-3">
      <button class="btn" :disabled="busy">{{ busy ? t("common.waitingWallet") : t("operators.submit") }}</button>
      <p v-if="!canWrite()" class="max-w-prose text-sm text-ink-soft">{{ t("errors.smartAccount") }}</p>
    </div>
  </form>
</template>

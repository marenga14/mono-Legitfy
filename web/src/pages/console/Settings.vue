<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import DetailField from "../../components/console/DetailField.vue";
import PageHead from "../../components/console/PageHead.vue";
import { api, session } from "../../lib/api";
import { t } from "../../lib/i18n";
import { networkName } from "../../lib/config";

interface Me { institution: string; role: string; level: number; agentEnabled: boolean; listed: boolean; hasLogo: boolean }
const me = ref<Me | null>(null);
const error = ref("");
const staff = computed(() => session.current?.role !== "platform");

const logo = ref<File>();
async function uploadLogo() {
  if (!logo.value) return;
  error.value = "";
  try {
    const body = new FormData();
    body.set("file", logo.value);
    await api("/institution/logo", { method: "POST", body });
    me.value!.hasLogo = true;
    logo.value = undefined;
    await loadLogo();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function toggleListing() {
  error.value = "";
  const listed = !me.value!.listed;
  try {
    await api("/institution/listing", { method: "PUT", body: JSON.stringify({ listed }) });
    me.value!.listed = listed;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const network = reactive({ name: "", chainId: 0, rpcUrl: "", explorerUrl: "", registry: "" });
const saving = ref(false);
interface Listed { name: string; chainId: number | string; hasLogo: boolean }
const listed = ref<Listed[]>([]);
const mainChain = ref<Listed | null>(null);
/** Starknet isn't EVM: it names its chains and its addresses are longer. */
const added = reactive({ kind: "evm" as "evm" | "starknet", name: "", chainId: 0 as number | string, rpcUrl: "", explorerUrl: "", registry: "" });
watch(() => added.kind, (kind) => (added.chainId = kind === "starknet" ? "SN_MAIN" : 0));
const addedLogo = ref<File>();
const adding = ref(false);

async function loadNetworks() {
  const n = await api<typeof network & { hasLogo: boolean; others: Listed[] }>("/network");
  Object.assign(network, { name: n.name, chainId: n.chainId, rpcUrl: n.rpcUrl, explorerUrl: n.explorerUrl, registry: n.registry });
  mainChain.value = n;
  listed.value = n.others;
}
const uploadNetworkLogo = (chainId: number | string, file: File) => {
  const body = new FormData();
  body.set("file", file);
  return api(`/platform/networks/${chainId}/logo`, { method: "POST", body });
};
async function changeLogo(chainId: number | string, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = "";
  try {
    await uploadNetworkLogo(chainId, file);
    await loadNetworks();
  } catch (err) {
    error.value = (err as Error).message;
  }
}
async function addNetwork() {
  error.value = "";
  adding.value = true;
  try {
    await api("/platform/networks", { method: "POST", body: JSON.stringify(added) });
    if (addedLogo.value) await uploadNetworkLogo(added.chainId, addedLogo.value);
    location.reload();
  } catch (e) {
    error.value = (e as Error).message;
    adding.value = false;
  }
}
async function removeNetwork(chainId: number | string) {
  error.value = "";
  try {
    await api(`/platform/networks/${chainId}`, { method: "DELETE" });
    location.reload();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function saveNetwork() {
  error.value = "";
  saving.value = true;
  try {
    await api("/platform/network", { method: "PUT", body: JSON.stringify(network) });
    location.reload(); // The site reads these once, when it loads.
  } catch (e) {
    error.value = (e as Error).message;
    saving.value = false;
  }
}

const currentLogo = ref("");
const newLogo = ref("");
watch(logo, (file) => {
  if (newLogo.value) URL.revokeObjectURL(newLogo.value);
  newLogo.value = file ? URL.createObjectURL(file) : "";
});
async function loadLogo() {
  if (!me.value?.hasLogo) return;
  if (currentLogo.value) URL.revokeObjectURL(currentLogo.value);
  currentLogo.value = URL.createObjectURL(await api<Blob>("/institution/logo"));
}
onBeforeUnmount(() => [currentLogo.value, newLogo.value].forEach((url) => url && URL.revokeObjectURL(url)));

onMounted(async () => {
  if (!staff.value) {
    await loadNetworks().catch((e) => (error.value = e.message));
    return;
  }
  try {
    me.value = await api("/me");
    await loadLogo();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
async function toggleAgent() {
  error.value = "";
  const enabled = !me.value!.agentEnabled;
  try {
    await api("/institution/agent", { method: "PUT", body: JSON.stringify({ enabled }) });
    me.value!.agentEnabled = enabled;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <PageHead :title="t('settings.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <dl class="panel mt-4 grid gap-4 p-5 sm:grid-cols-2">
    <DetailField :label="t('settings.role')" :value="t(`settings.roles.${session.current?.role}`)" />
    <DetailField :label="t('settings.network')" :value="networkName" />
    <template v-if="me">
      <DetailField :label="t('settings.institution')" :value="me.institution" />
      <DetailField :label="t('settings.level')" :value="t(`levels.${me.level}`)" />
    </template>
    <DetailField class="sm:col-span-2" :label="t('settings.account')"><span class="hash">{{ session.current?.account }}</span></DetailField>
  </dl>
  <section v-if="me?.role === 'admin'" class="panel mt-4 p-5">
    <h2 class="text-lg">{{ t("settings.assistant") }}</h2>
    <p class="mt-2 max-w-prose text-ink-soft">
      {{ me.agentEnabled ? t("settings.on") : t("settings.off") }} {{ t("settings.assistantBody") }}
    </p>
    <button class="btn mt-4" @click="toggleAgent">{{ me.agentEnabled ? t("settings.turnOff") : t("settings.turnOn") }}</button>
  </section>
  <section v-if="me?.role === 'admin'" class="panel mt-4 p-5">
    <h2 class="text-lg">{{ t("settings.listingTitle") }}</h2>
    <p class="mt-2 max-w-prose text-ink-soft">{{ me.listed ? t("settings.on") : t("settings.off") }} {{ t("settings.listingBody") }}</p>
    <div v-if="currentLogo || newLogo" class="mt-4 flex flex-wrap gap-4">
      <figure v-if="currentLogo">
        <figcaption class="mb-1 text-sm font-semibold">{{ t("settings.currentLogo") }}</figcaption>
        <img :src="currentLogo" :alt="t('settings.currentLogo')" class="size-28 rounded-md border border-line bg-white object-contain p-2" />
      </figure>
      <figure v-if="newLogo">
        <figcaption class="mb-1 text-sm font-semibold">{{ t("settings.newLogo") }}</figcaption>
        <img :src="newLogo" :alt="t('settings.newLogo')" class="size-28 rounded-md border border-line bg-white object-contain p-2" />
      </figure>
    </div>
    <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="uploadLogo">
      <label>{{ t("settings.logo") }}<input type="file" accept="image/png,image/jpeg" class="field mt-1" required @change="logo = ($event.target as HTMLInputElement).files?.[0]" /></label>
      <button class="btn btn-quiet" :disabled="!logo">{{ me.hasLogo ? t("settings.replaceLogo") : t("settings.uploadLogo") }}</button>
    </form>
    <button class="btn mt-4" :disabled="!me.hasLogo" @click="toggleListing">{{ me.listed ? t("settings.hideListing") : t("settings.showListing") }}</button>
  </section>
  <form v-if="!staff" class="panel mt-4 grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="saveNetwork">
    <h2 class="text-lg sm:col-span-2">{{ t("settings.networkTitle") }}</h2>
    <p class="max-w-prose text-ink-soft sm:col-span-2">{{ t("settings.networkBody") }}</p>
    <label>{{ t("settings.networkName") }}<input v-model="network.name" class="field mt-1" required minlength="2" maxlength="80" /></label>
    <label>{{ t("settings.chainId") }}<input v-model.number="network.chainId" type="number" min="1" class="field mt-1" required /></label>
    <label>{{ t("developers.rpc") }}<input v-model="network.rpcUrl" type="url" class="field mt-1 hash" required /></label>
    <label>{{ t("developers.explorer") }}<input v-model="network.explorerUrl" type="url" class="field mt-1 hash" required /></label>
    <label class="sm:col-span-2">{{ t("developers.registry") }}<input v-model="network.registry" class="field mt-1 hash" required pattern="0x[0-9a-fA-F]{40}" :title="t('common.walletPattern')" /></label>
    <div class="sm:col-span-2"><button class="btn" :disabled="saving">{{ t("settings.saveNetwork") }}</button></div>
  </form>
  <section v-if="!staff" class="panel mt-4 p-5">
    <h2 class="text-lg">{{ t("settings.networksTitle") }}</h2>
    <p class="mt-2 max-w-prose text-ink-soft">{{ t("settings.networksBody") }}</p>
    <ul class="mt-4 space-y-3">
      <li v-for="n in mainChain ? [mainChain, ...listed] : listed" :key="n.chainId" class="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <span class="min-w-40 font-semibold">{{ n.name }}</span>
        <label class="text-sm">{{ n.hasLogo ? t("settings.replaceLogo") : t("settings.uploadLogo") }}<input type="file" accept="image/png,image/jpeg" class="field mt-1" :aria-label="`${t('settings.uploadLogo')}: ${n.name}`" @change="changeLogo(n.chainId, $event)" /></label>
        <button v-if="n !== mainChain" type="button" class="btn btn-quiet" @click="removeNetwork(n.chainId)">{{ t("settings.removeNetwork") }}</button>
      </li>
    </ul>
    <form class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="addNetwork">
      <h3 class="text-base sm:col-span-2">{{ t("settings.addNetwork") }}</h3>
      <label class="sm:col-span-2">{{ t("settings.networkKind") }}
        <select v-model="added.kind" class="field mt-1">
          <option value="evm">{{ t("settings.kindEvm") }}</option>
          <option value="starknet">Starknet</option>
        </select>
      </label>
      <p v-if="added.kind === 'starknet'" class="max-w-prose text-sm text-ink-soft sm:col-span-2">{{ t("settings.starknetBody") }}</p>
      <label>{{ t("settings.networkName") }}<input v-model="added.name" class="field mt-1" required minlength="2" maxlength="80" /></label>
      <label v-if="added.kind === 'evm'">{{ t("settings.chainId") }}<input v-model.number="added.chainId" type="number" min="1" class="field mt-1" required /></label>
      <label v-else>{{ t("settings.chainId") }}
        <select v-model="added.chainId" class="field mt-1">
          <option value="SN_MAIN">SN_MAIN</option>
          <option value="SN_SEPOLIA">SN_SEPOLIA</option>
        </select>
      </label>
      <label>{{ t("developers.rpc") }}<input v-model="added.rpcUrl" type="url" class="field mt-1 hash" required /></label>
      <label>{{ t("developers.explorer") }}<input v-model="added.explorerUrl" type="url" class="field mt-1 hash" required /></label>
      <label class="sm:col-span-2">{{ t("developers.registry") }}<input v-model="added.registry" class="field mt-1 hash" required :pattern="added.kind === 'starknet' ? '0x[0-9a-fA-F]{1,64}' : '0x[0-9a-fA-F]{40}'" :title="t('common.walletPattern')" /></label>
      <label class="sm:col-span-2">{{ t("settings.networkLogo") }}<input type="file" accept="image/png,image/jpeg" class="field mt-1" @change="addedLogo = ($event.target as HTMLInputElement).files?.[0]" /></label>
      <div class="sm:col-span-2"><button class="btn" :disabled="adding">{{ t("settings.addNetwork") }}</button></div>
    </form>
  </section>
</template>

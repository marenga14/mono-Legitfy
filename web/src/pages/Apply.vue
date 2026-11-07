<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { Address } from "viem";
import ApplyHero from "../components/ApplyHero.vue";
import WalletGuide from "../components/WalletGuide.vue";
import { api } from "../lib/api";
import { shortId } from "../lib/certificate";
import { currentLocale, t } from "../lib/i18n";
import { connectWallet, hasWallet, signMessage } from "../lib/wallet";

const ID_TYPES = ["national_id", "passport", "driving_licence", "voter_id"];
const TYPES = ["university", "college", "school", "professional_body", "government", "other"];
const router = useRouter();
const form = reactive({
  institutionName: "", registrationNumber: "", institutionType: "", country: "", city: "", website: "", officialEmail: "", phone: "",
  applicantName: "", applicantPosition: "", applicantEmail: "", signatoryName: "", signatoryTitle: "", identityDocument: "", identityNumber: "",
});
const file = ref<File>();
const identityConsent = ref(false);
const wallet = ref<Address | "">("");
const confirmed = ref(false);
const error = ref("");
const walletError = ref("");
const busy = ref(false);
const needs = computed(() => [1, 2, 3, 4, 5].map((n) => t(`apply.need${n}`)));

async function connect() {
  walletError.value = "";
  try {
    wallet.value = await connectWallet();
  } catch (e) {
    walletError.value = (e as Error).message;
  }
}

async function submit() {
  error.value = "";
  if (!wallet.value) return (error.value = t("apply.connectFirst"));
  if (!file.value) return (error.value = t("apply.attachRegistration"));
  busy.value = true;
  try {
    const { nonce, message } = await api<{ nonce: string; message: string }>("/applications/challenge", {
      method: "POST", body: JSON.stringify({ institutionName: form.institutionName }),
    });
    const signature = await signMessage(wallet.value, message);
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) body.set(k, v);
    body.set("confirmed", String(confirmed.value));
    body.set("locale", currentLocale());
    body.set("identityConsent", String(identityConsent.value));
    body.set("nonce", nonce);
    body.set("signature", signature);
    body.set("file", file.value);
    const { trackingToken } = await api<{ trackingToken: string }>("/applications", { method: "POST", body });
    router.push({ path: `/apply/${trackingToken}`, query: { sent: "1" } });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="relative mx-auto max-w-3xl px-6 py-12">
    <ApplyHero :title="t('apply.title')" :sub="t('apply.sub')" />
    <div class="glass relative mt-8 p-6">
      <h2 class="text-xl">{{ t("apply.needTitle") }}</h2>
      <ul class="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft"><li v-for="n in needs" :key="n">{{ n }}</li></ul>
    </div>

    <form class="relative mt-6 space-y-6" @submit.prevent="submit">
      <fieldset class="glass grid gap-5 p-6 sm:grid-cols-2">
        <legend class="px-2 text-xl font-semibold">{{ t("apply.institutionSection") }}</legend>
        <label class="sm:col-span-2">{{ t("apply.name") }}<input v-model="form.institutionName" class="field mt-1" required minlength="2" maxlength="200" autocomplete="organization" /><span class="mt-1 block text-sm text-ink-soft">{{ t("apply.nameHint") }}</span></label>
        <label>{{ t("apply.number") }}<input v-model="form.registrationNumber" class="field mt-1" required minlength="2" maxlength="100" /></label>
        <label>{{ t("apply.type") }}
          <select v-model="form.institutionType" class="field mt-1" required>
            <option value="" disabled>{{ t("apply.chooseType") }}</option>
            <option v-for="type in TYPES" :key="type" :value="type">{{ t(`applications.types.${type}`) }}</option>
          </select>
        </label>
        <label>{{ t("apply.country") }}<input v-model="form.country" class="field mt-1" required minlength="2" maxlength="100" autocomplete="country-name" /></label>
        <label>{{ t("apply.city") }}<input v-model="form.city" class="field mt-1" required minlength="2" maxlength="100" /></label>
        <label>{{ t("apply.email") }}<input v-model="form.officialEmail" type="email" class="field mt-1" required maxlength="254" /></label>
        <label>{{ t("apply.phone") }}<input v-model="form.phone" type="tel" class="field mt-1" required minlength="5" maxlength="40" /></label>
        <label class="sm:col-span-2">{{ t("apply.website") }}<input v-model="form.website" type="url" class="field mt-1" maxlength="200" placeholder="https://" /></label>
        <label class="sm:col-span-2">{{ t("apply.registrationFile") }}
          <input type="file" accept="application/pdf,image/jpeg,image/png" class="field mt-1" required @change="file = ($event.target as HTMLInputElement).files?.[0]" />
          <span class="mt-1 block text-sm text-ink-soft">{{ t("apply.fileHint") }}</span>
        </label>
      </fieldset>

      <fieldset class="glass grid gap-5 p-6 sm:grid-cols-2">
        <legend class="px-2 text-xl font-semibold">{{ t("apply.peopleSection") }}</legend>
        <label>{{ t("apply.applicantName") }}<input v-model="form.applicantName" class="field mt-1" required minlength="2" maxlength="120" autocomplete="name" /></label>
        <label>{{ t("apply.applicantPosition") }}<input v-model="form.applicantPosition" class="field mt-1" required minlength="2" maxlength="120" /></label>
        <label class="sm:col-span-2">{{ t("apply.applicantEmail") }}<input v-model="form.applicantEmail" type="email" class="field mt-1" required maxlength="254" /><span class="mt-1 block text-sm text-ink-soft">{{ t("apply.applicantEmailHint") }}</span></label>
        <label>{{ t("apply.signatoryName") }}<input v-model="form.signatoryName" class="field mt-1" required minlength="2" maxlength="120" /></label>
        <label>{{ t("apply.signatoryTitle") }}<input v-model="form.signatoryTitle" class="field mt-1" required minlength="2" maxlength="120" :placeholder="t('apply.signatoryHint')" /></label>
      </fieldset>

      <fieldset class="glass grid gap-5 p-6 sm:grid-cols-2">
        <legend class="px-2 text-xl font-semibold">{{ t("apply.identitySection") }}</legend>
        <p class="text-ink-soft sm:col-span-2">{{ t("apply.identityWhy") }}</p>
        <label>{{ t("apply.identityDocument") }}
          <select v-model="form.identityDocument" class="field mt-1" required>
            <option value="" disabled>{{ t("apply.chooseIdentity") }}</option>
            <option v-for="type in ID_TYPES" :key="type" :value="type">{{ t(`applications.ids.${type}`) }}</option>
          </select>
        </label>
        <label>{{ t("apply.identityNumber") }}<input v-model="form.identityNumber" class="field mt-1" required minlength="4" maxlength="40" pattern="[A-Za-z0-9 /\-]+" autocomplete="off" spellcheck="false" /></label>
        <label class="flex items-start gap-3 sm:col-span-2">
          <input v-model="identityConsent" type="checkbox" class="mt-1.5 size-4 accent-stamp" required />
          <span>{{ t("apply.identityConsent") }}</span>
        </label>
      </fieldset>

      <fieldset class="glass p-6">
        <legend class="px-2 text-xl font-semibold">{{ t("apply.walletSection") }}</legend>
        <p class="text-ink-soft">{{ t("apply.walletWhy") }}</p>
        <div v-if="wallet" class="mt-4">
          <p class="font-semibold text-approve">{{ t("apply.connected") }}</p>
          <p class="hash mt-1 break-all" :title="wallet">{{ wallet }}</p>
          <p class="mt-2 text-sm text-ink-soft">{{ t("apply.wrongWallet") }} <button type="button" class="link" @click="connect">{{ t("apply.refresh") }}</button></p>
        </div>
        <template v-else>
          <button v-if="hasWallet()" type="button" class="btn mt-4" @click="connect">{{ t("apply.connect") }}</button>
          <p v-else class="mt-4 font-semibold text-caution">{{ t("apply.noWallet") }}</p>
          <p v-if="walletError" class="mt-3 text-seal" role="alert">{{ walletError }}</p>
        </template>
        <details class="mt-5" :open="!hasWallet()">
          <summary class="cursor-pointer font-semibold">{{ t("apply.guideToggle") }}</summary>
          <WalletGuide class="mt-4" />
        </details>
      </fieldset>

      <label class="flex items-start gap-3">
        <input v-model="confirmed" type="checkbox" class="mt-1.5 size-4 accent-stamp" required />
        <span>{{ t("apply.confirm") }}</span>
      </label>
      <p v-if="error" class="text-seal" role="alert">{{ error }}</p>
      <button class="btn" :disabled="busy || !wallet">{{ busy ? t("common.waitingWallet") : t("apply.submit") }}</button>
      <p v-if="!wallet" class="text-sm text-ink-soft">{{ t("apply.connectFirst") }}</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import ApplyHero from "../components/ApplyHero.vue";
import TrackingLink from "../components/TrackingLink.vue";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { downloadMandate, type MandateDetails } from "../lib/mandate";

interface Track extends MandateDetails { status: string; reviewReason: string | null; submittedAt: string }
const token = String(useRoute().params.token);
const a = ref<Track | null>(null);
const error = ref("");
const uploadError = ref("");
const file = ref<File>();
const busy = ref(false);

async function load() {
  try {
    a.value = await api(`/applications/track/${token}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function upload() {
  if (!file.value) return;
  uploadError.value = "";
  busy.value = true;
  try {
    const body = new FormData();
    body.set("file", file.value);
    await api(`/applications/track/${token}/mandate`, { method: "POST", body });
    file.value = undefined;
    await load();
  } catch (e) {
    uploadError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="relative mx-auto max-w-2xl px-6 py-12">
    <p v-if="error" class="text-seal" role="alert">{{ error }}</p>
    <template v-else-if="a">
      <TrackingLink class="relative mb-10" :body="t('tracking.applicationBody')" :sent="t('tracking.applicationSent')" />
      <ApplyHero :title="a.institutionName" :sub="t('track2.reference', { reference: a.reference })" />
      <p class="relative mt-3 text-xl font-semibold">{{ t(`applications.status.${a.status}`) }}</p>

      <template v-if="a.status === 'awaiting_mandate' || a.status === 'under_review'">
        <p v-if="a.status === 'under_review'" class="mt-2 text-ink-soft">{{ t("track2.reviewing") }}</p>
        <div v-else class="glass relative mt-6 p-6">
          <h2 class="text-xl">{{ t("track2.nextTitle") }}</h2>
          <ol class="mt-3 list-decimal space-y-2 pl-5">
            <li>{{ t("track2.step1") }}</li>
            <li>{{ t("track2.step2", { name: a.signatoryName, title: a.signatoryTitle }) }}</li>
            <li>{{ t("track2.step3") }}</li>
            <li>{{ t("track2.step4") }}</li>
          </ol>
          <button class="btn mt-5" @click="downloadMandate(a!)">{{ t("track2.download") }}</button>
        </div>
        <form class="glass relative mt-5 space-y-4 p-6" @submit.prevent="upload">
          <h2 class="text-xl">{{ a.status === "under_review" ? t("track2.replace") : t("track2.uploadTitle") }}</h2>
          <label class="block">{{ t("track2.file") }}
            <input type="file" accept="application/pdf,image/jpeg,image/png" class="field mt-1" required @change="file = ($event.target as HTMLInputElement).files?.[0]" />
            <span class="mt-1 block text-sm text-ink-soft">{{ t("apply.fileHint") }}</span>
          </label>
          <p v-if="uploadError" class="text-seal" role="alert">{{ uploadError }}</p>
          <button class="btn" :disabled="busy || !file">{{ busy ? t("request.sending") : t("track2.upload") }}</button>
        </form>
      </template>

      <template v-else-if="a.status === 'approved'">
        <p class="mt-2 max-w-prose text-ink-soft">{{ t("track2.approved") }}</p>
        <RouterLink to="/sign-in" class="btn mt-5">{{ t("track2.signIn") }}</RouterLink>
      </template>

      <template v-else>
        <p class="mt-2 font-semibold">{{ t("track2.reason") }}</p>
        <p class="mt-1 max-w-prose whitespace-pre-line">{{ a.reviewReason }}</p>
        <RouterLink to="/apply" class="btn mt-5">{{ t("track2.again") }}</RouterLink>
      </template>

    </template>
    <p v-else>{{ t("track.loading") }}</p>
  </section>
</template>

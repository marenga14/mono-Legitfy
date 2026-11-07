<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import TrackingLink from "../components/TrackingLink.vue";
import { api } from "../lib/api";
import { dateLocale, t } from "../lib/i18n";

interface Track {
  subject: string; institution: string; status: string; submittedAt: string; dueAt: string;
  outcome: string | null; note: string | null; answeredAt: string | null; receipt: string | null;
}
const token = String(useRoute().params.token);
const r = ref<Track | null>(null);
const error = ref("");
onMounted(async () => {
  try {
    r.value = await api(`/requests/track/${token}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
const outcome = computed(() => ({
  confirmed: { title: t("track.confirmed"), tone: "text-approve" },
  not_confirmed: { title: t("track.notConfirmed"), tone: "text-seal" },
  needs_information: { title: t("track.needsInfo"), tone: "text-caution" },
})[r.value?.outcome ?? ""]);
const date = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { dateStyle: "long" });
</script>

<template>
  <section class="mx-auto max-w-2xl px-6 py-12">
    <p v-if="error" class="text-seal" role="alert">{{ error }}</p>
    <template v-else-if="r">
      <TrackingLink class="mb-10" :body="t('tracking.requestBody')" :sent="t('tracking.requestSent', { institution: r.institution })" />
      <h1 class="text-5xl">{{ r.subject }}</h1>
      <p class="mt-2 text-ink-soft">{{ t("track.sent", { institution: r.institution, date: date(r.submittedAt) }) }}</p>
      <div v-if="outcome" class="mt-8">
        <h2 :class="['text-3xl', outcome.tone]">{{ outcome.title }}</h2>
        <p v-if="r.note" class="mt-2 max-w-prose whitespace-pre-line">{{ r.note }}</p>
        <p class="mt-2 text-ink-soft">{{ t("track.answered", { institution: r.institution, date: date(r.answeredAt!) }) }}</p>
        <p class="mt-4 text-ink-soft">{{ t("track.receipt") }} <span class="hash">{{ r.receipt }}</span></p>
      </div>
      <div v-else class="mt-8">
        <h2 class="text-3xl">{{ t("track.waiting", { institution: r.institution }) }}</h2>
        <p class="mt-2 max-w-prose text-ink-soft">{{ r.status === "in_review" ? t("track.inReview") : t("track.queued") }}</p>
      </div>
    </template>
    <p v-else>{{ t("track.loading") }}</p>
  </section>
</template>

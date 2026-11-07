<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import StoryRows from "../components/StoryRows.vue";
import { t } from "../lib/i18n";
const results = computed(() => [
  { key: "issued", tone: "text-approve" },
  { key: "revoked", tone: "text-seal" },
  { key: "replaced", tone: "text-caution" },
  { key: "suspended", tone: "text-caution" },
  { key: "none", tone: "text-ink" },
].map((r) => ({ title: t(`verifiers.${r.key}`), tone: r.tone, body: t(`verifiers.${r.key}Body`) })));
</script>

<template>
  <section class="mx-auto max-w-7xl px-6 py-14">
    <h1 class="max-w-4xl text-6xl">{{ t("verifiers.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("verifiers.sub") }}</p>
    <div class="mt-8 flex flex-wrap gap-3">
      <RouterLink to="/verify" class="btn">{{ t("verifiers.check") }}</RouterLink>
      <RouterLink to="/request" class="btn btn-quiet">{{ t("verifiers.ask") }}</RouterLink>
    </div>
    <StoryRows class="mt-16" :rows="['check', 'ask']" />
    <h2 class="mt-16 text-4xl">{{ t("verifiers.results") }}</h2>
    <dl class="glass mt-6 max-w-4xl px-6">
      <div v-for="r in results" :key="r.title" class="grid gap-1 border-b border-periwinkle/15 py-4 last:border-0 sm:grid-cols-[12rem_1fr]">
        <dt :class="['text-lg font-semibold', r.tone]">{{ r.title }}</dt>
        <dd class="text-ink-soft">{{ r.body }}</dd>
      </div>
    </dl>
  </section>
</template>

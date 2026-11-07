<script setup lang="ts">
import StoryRows from "../components/StoryRows.vue";
import { t } from "../lib/i18n";
</script>

<template>
  <section class="mx-auto max-w-7xl px-6 py-14">
    <h1 class="max-w-4xl text-6xl">{{ t("how.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("how.sub") }}</p>
    <h2 class="mt-16 text-5xl">{{ t("how.institutions") }}</h2>
    <StoryRows class="mt-10" numbered :rows="['apply', 'publish', 'share']" />
    <h2 class="mt-20 text-5xl">{{ t("how.verifiers") }}</h2>
    <StoryRows class="mt-10" numbered :rows="['check', 'ask']" />
    <div class="mt-16 flex flex-wrap gap-3">
      <RouterLink to="/apply" class="btn">{{ t("institutions.apply") }}</RouterLink>
      <RouterLink to="/verify" class="btn btn-quiet">{{ t("hero.cta") }}</RouterLink>
    </div>
  </section>
</template>

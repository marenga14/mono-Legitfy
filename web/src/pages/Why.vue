<script setup lang="ts">
import StoryRows from "../components/StoryRows.vue";
import { t } from "../lib/i18n";
</script>

<template>
  <section class="mx-auto max-w-7xl px-6 py-14">
    <h1 class="max-w-4xl text-6xl">{{ t("why.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("why.sub") }}</p>
    <h2 class="mt-16 text-5xl">{{ t("why.problem") }}</h2>
    <StoryRows class="mt-10" :rows="['slow', 'fakes', 'waiting', 'exposed']" />
    <h2 class="mt-20 text-5xl">{{ t("why.solution") }}</h2>
    <StoryRows class="mt-10" :rows="['publish', 'check', 'ask', 'private']" />
    <div class="mt-16 flex flex-wrap gap-3">
      <RouterLink to="/verify" class="btn">{{ t("hero.cta") }}</RouterLink>
      <RouterLink to="/apply" class="btn btn-quiet">{{ t("institutions.apply") }}</RouterLink>
    </div>
  </section>
</template>

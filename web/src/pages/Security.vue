<script setup lang="ts">
import StoryRows from "../components/StoryRows.vue";
import { t } from "../lib/i18n";
</script>

<template>
  <section class="mx-auto max-w-7xl px-6 py-14">
    <h1 class="max-w-4xl text-6xl">{{ t("securityPage.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("securityPage.sub") }}</p>
    <StoryRows class="mt-14" :rows="['noPersonalData', 'private', 'people', 'history', 'apply']" />
  </section>
</template>

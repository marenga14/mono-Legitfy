<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import StoryRows from "../components/StoryRows.vue";
import { contactEmail } from "../lib/config";
import { t } from "../lib/i18n";

const items = computed(() => [1, 2, 3, 4, 5].map((n) => ({ title: t(`institutions.item${n}Title`), body: t(`institutions.item${n}Body`) })));
</script>

<template>
  <section class="mx-auto max-w-7xl px-6 py-14">
    <h1 class="max-w-4xl text-6xl">{{ t("institutions.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("institutions.sub") }}</p>
    <RouterLink to="/apply" class="btn mt-7">{{ t("institutions.apply") }}</RouterLink>
    <div class="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in items" :key="i.title" class="glass p-6">
        <h2 class="text-xl">{{ i.title }}</h2>
        <p class="mt-2 max-w-prose text-ink-soft">{{ i.body }}</p>
      </div>
    </div>
    <StoryRows class="mt-20" :rows="['ask', 'apply', 'history']" />
    <div class="mt-12 flex flex-wrap gap-3">
      <RouterLink to="/apply" class="btn">{{ t("institutions.apply") }}</RouterLink>
      <a v-if="contactEmail" class="btn btn-quiet" :href="`mailto:${contactEmail}?subject=Legitfy%20for%20our%20institution`">{{ t("institutions.contact") }}</a>
      <RouterLink to="/sign-in" class="btn btn-quiet">{{ t("institutions.staffSignIn") }}</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { t } from "../lib/i18n";
import { STORIES, type Story } from "../lib/stories";
import Illustration from "./Illustration.vue";

const props = defineProps<{ rows: Story[]; numbered?: boolean }>();
const items = computed(() => props.rows.map((key, i) => ({ key, art: STORIES[key], flip: i % 2 === 1, title: t(`story.${key}.title`), body: t(`story.${key}.body`) })));
</script>

<template>
  <component :is="numbered ? 'ol' : 'div'" class="space-y-16 lg:space-y-10">
    <component :is="numbered ? 'li' : 'div'" v-for="(item, i) in items" :key="item.key" v-reveal class="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div :class="['mx-auto w-full max-w-md lg:max-w-none', item.flip && 'lg:order-2']"><Illustration :name="item.art" /></div>
      <div :class="item.flip ? 'lg:order-1' : ''">
        <p v-if="numbered" class="text-lg font-semibold text-periwinkle">{{ t("how.step", { n: i + 1 }) }}</p>
        <h3 class="mt-1 text-4xl">{{ item.title }}</h3>
        <p class="mt-4 max-w-lg text-lg text-ink-soft">{{ item.body }}</p>
      </div>
    </component>
  </component>
</template>

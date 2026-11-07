<script setup lang="ts">
import { computed } from "vue";
import { dateLocale, t } from "../../lib/i18n";

const props = defineProps<{ title: string; noun: string; data: { month: string; count: number }[] }>();
const monthName = (m: string, style: "short" | "long") =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(dateLocale(), { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" });
const max = computed(() => Math.max(...props.data.map((d) => d.count), 0));
const peak = computed(() => props.data.findIndex((d) => d.count === max.value));
</script>

<template>
  <figure class="panel p-5">
    <figcaption class="font-semibold text-harbour">{{ title }}</figcaption>
    <p v-if="max === 0" class="mt-4 text-ink-soft">{{ t("dashboard.empty") }}</p>
    <template v-else>
      <div class="mt-6 grid h-52 grid-cols-6 gap-3 border-b border-line" aria-hidden="true">
        <div v-for="(d, i) in data" :key="d.month" tabindex="-1" class="group relative flex h-full items-end justify-center">
          <span v-if="i === peak" class="absolute text-sm font-semibold text-ink group-hover:opacity-0" :style="{ bottom: `calc(${(d.count / max) * 88}% + 0.25rem)` }">{{ d.count }}</span>
          <span class="tip">{{ monthName(d.month, "long") }}: {{ d.count }} {{ noun }}</span>
          <span class="w-full max-w-9 bar rounded-t-md" :style="{ height: `${(d.count / max) * 88}%`, minHeight: d.count ? '3px' : 0 }"></span>
        </div>
      </div>
      <div class="mt-2 grid grid-cols-6 gap-3 text-center text-sm text-ink-soft" aria-hidden="true">
        <span v-for="d in data" :key="d.month">{{ monthName(d.month, "short") }}</span>
      </div>
      <table class="sr-only">
        <caption>{{ title }}</caption>
        <thead><tr><th>{{ t("dashboard.month") }}</th><th>{{ noun }}</th></tr></thead>
        <tbody><tr v-for="d in data" :key="d.month"><td>{{ monthName(d.month, "long") }}</td><td>{{ d.count }}</td></tr></tbody>
      </table>
    </template>
  </figure>
</template>

<style scoped>
.tip { position: absolute; bottom: 100%; z-index: 5; display: none; padding: 0.3rem 0.6rem; font-size: 0.8rem; white-space: nowrap; color: #fff; background: #1a1560; border-radius: 5px; }
.group:hover .tip { display: block; }
.bar { background: linear-gradient(to top, #6a3bf0, #8fa8ff); transition: filter 0.15s; }
.group:hover .bar { filter: brightness(1.15); }
</style>

<script setup lang="ts">
import { Globe } from "lucide-vue-next";
import { currentLocale, LOCALES, setLocale, t, type Locale } from "../lib/i18n";
</script>

<template>
  <label class="relative inline-flex items-center gap-1.5 text-sm font-medium">
    <Globe class="size-4 shrink-0" aria-hidden="true" />
    <span class="sr-only">{{ t("lang.label") }}</span>
    <select class="lang-select" :value="currentLocale()" @change="setLocale(($event.target as HTMLSelectElement).value as Locale)">
      <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">{{ l.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.lang-select { field-sizing: content; min-height: 2.25rem; padding: 0.15rem 0.25rem; background: transparent; color: inherit; border-radius: 6px; cursor: pointer; }
.lang-select option { background: var(--color-sheet); color: var(--color-ink); }
</style>

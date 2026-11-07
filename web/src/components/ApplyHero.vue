<script setup lang="ts">
import { t } from "../lib/i18n";
import BrandMark from "./BrandMark.vue";
import BrandWordmark from "./BrandWordmark.vue";
defineProps<{ title: string; sub?: string }>();
</script>

<template>
  <BrandMark class="watermark" />
  <header class="relative">
    <div class="flex items-center gap-4">
      <span class="brand-tile size-20 shrink-0 shadow-[0_0_34px_rgb(124_77_255/0.45)]"><BrandMark class="h-11 w-auto" /></span>
      <p class="leading-tight">
        <BrandWordmark class="block text-2xl" />
        <span class="block text-sm font-semibold text-periwinkle">{{ t("apply.eyebrow") }}</span>
      </p>
    </div>
    <h1 class="mt-7 text-5xl">{{ title }}</h1>
    <p v-if="sub" class="mt-3 text-ink-soft">{{ sub }}</p>
  </header>
</template>

<style scoped>
.watermark { position: absolute; top: 4rem; right: -5rem; width: min(34rem, 88vw); height: auto; opacity: 0.06; pointer-events: none; }
</style>

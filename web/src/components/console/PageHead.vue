<script setup lang="ts">
import { RouterLink } from "vue-router";
import { ArrowLeft } from "lucide-vue-next";
defineProps<{ title: string; back?: string; backLabel?: string }>();
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
    <div class="flex items-center gap-3">
      <RouterLink v-if="back" :to="back" class="bg-gradient rounded-lg p-2" :aria-label="backLabel"><ArrowLeft class="size-5" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl">{{ title }}</h1>
    </div>
    <slot />
  </div>
</template>

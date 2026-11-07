<script setup lang="ts">
import { computed } from "vue";
import { fingerprintPaths, IDLE_PATTERN } from "../lib/fingerprint";
import { t } from "../lib/i18n";

const props = defineProps<{ hash?: string }>();
const paths = computed(() => fingerprintPaths(props.hash ?? IDLE_PATTERN));
</script>

<template>
  <svg viewBox="0 0 200 200" role="img" :aria-label="hash ? t('fingerprint.of', { hash }) : t('fingerprint.placeholder')" :class="['print', !hash && 'opacity-45']">
    <!-- Keyed so a new file redraws its ridges from nothing. -->
    <g :key="hash ?? 'idle'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path v-for="(d, i) in paths" :key="i" :d="d" pathLength="1" :class="hash && 'ridge'" :style="{ animationDelay: `${i * 45}ms` }" />
    </g>
  </svg>
</template>

<style scoped>
.ridge { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 0.7s ease-out forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
</style>

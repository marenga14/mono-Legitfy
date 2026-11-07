<script setup lang="ts">
import { computed } from "vue";
import { fingerprintPaths } from "../lib/fingerprint";

const props = defineProps<{ x: number; y: number; size: number; seed: string }>();
const paths = computed(() => fingerprintPaths(`0x${props.seed.repeat(8)}`));
</script>

<template>
  <!-- The ridges draw themselves when the row around them scrolls into view. -->
  <g :transform="`translate(${x} ${y}) scale(${size / 200})`" fill="none" stroke-linecap="round" stroke-width="3">
    <path v-for="(d, i) in paths" :key="i" :d="d" pathLength="1" class="story-ridge" :style="{ transitionDelay: `${i * 60}ms` }" />
  </g>
</template>

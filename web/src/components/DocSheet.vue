<script setup lang="ts">
const { lines = 4, rotate = 0 } = defineProps<{ x: number; y: number; w: number; h: number; rotate?: number; lines?: number }>();
</script>

<template>
  <g :transform="`translate(${x} ${y}) rotate(${rotate} ${w / 2} ${h / 2})`">
    <rect :width="w" :height="h" rx="6" class="sheet" />
    <rect x="14" y="16" :width="w * 0.45" height="6" rx="3" class="ink" />
    <rect v-for="n in lines" :key="n" x="14" :y="26 + n * 13" :width="(w - 28) * (n % 3 === 0 ? 0.62 : 0.92)" height="3.5" rx="1.75" class="soft" />
    <slot />
  </g>
</template>

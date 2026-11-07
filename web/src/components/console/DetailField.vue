<script setup lang="ts">
defineProps<{ label: string; value?: string }>();
</script>

<template>
  <div class="border-b border-dotted border-line pb-2">
    <dt class="text-sm font-semibold text-harbour">{{ label }}</dt>
    <dd class="mt-0.5"><slot>{{ value }}</slot></dd>
  </div>
</template>

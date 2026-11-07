<script setup lang="ts">
import { shownNetworks } from "../lib/config";
import { t } from "../lib/i18n";
</script>

<template>
  <section :aria-label="t('networks.title')">
    <h2 class="text-3xl">{{ t("networks.title") }}</h2>
    <p class="mt-2 max-w-xl text-ink-soft">{{ t("networks.sub") }}</p>
    <ul class="mt-6 flex flex-wrap gap-3">
      <li v-for="n in shownNetworks" :key="n.name">
        <a :href="n.explorerUrl" target="_blank" rel="noopener" class="glass flex min-h-14 items-center gap-3 px-4 py-2 font-semibold hover:bg-paper-deep">
          <img v-if="n.logo" :src="n.logo" alt="" class="size-8 rounded-full object-contain" />
          {{ n.name }}
        </a>
      </li>
    </ul>
  </section>
</template>

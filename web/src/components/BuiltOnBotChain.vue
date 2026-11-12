<script setup lang="ts">
import { ExternalLink } from "lucide-vue-next";
import { botChainExplorer, botChainSite } from "../lib/config";
import { t } from "../lib/i18n";
</script>

<template>
  <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <a :href="botChainSite" target="_blank" rel="noopener" class="inline-flex items-center gap-2 font-semibold text-ink hover:underline">
      <img src="/chains/bot-chain.png" alt="" class="size-6 rounded-full" />{{ t("footer.builtOn") }} BOT Chain
    </a>
    <a :href="botChainSite" target="_blank" rel="noopener" class="link inline-flex items-center gap-1">botchain.ai<ExternalLink class="size-3.5" aria-hidden="true" /></a>
    <a :href="botChainExplorer" target="_blank" rel="noopener" class="link inline-flex items-center gap-1">scan.botchain.ai<ExternalLink class="size-3.5" aria-hidden="true" /></a>
  </p>
</template>

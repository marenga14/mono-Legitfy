<script lang="ts">
export interface ChainProof { status: "anchored" | "pending" | "off"; txHash: string | null; anchoredAt: string | null }
</script>

<script setup lang="ts">
import { computed } from "vue";
import { shortId } from "../../lib/certificate";
import { explorerUrl, isDevChain } from "../../lib/config";
import { dateLocale, t } from "../../lib/i18n";

const props = defineProps<{ chain: ChainProof }>();
const date = computed(() => (props.chain.anchoredAt ? new Date(props.chain.anchoredAt).toLocaleDateString(dateLocale(), { dateStyle: "medium" }) : ""));
</script>

<template>
  <span class="whitespace-nowrap">
    <template v-if="chain.status === 'anchored'">
      {{ t("inbox.chain.anchored", { date }) }}
      <!-- A development chain has no public explorer to link to. -->
      <a v-if="chain.txHash && !isDevChain" class="link hash block" :href="`${explorerUrl}/tx/${chain.txHash}`" rel="noopener">{{ shortId(chain.txHash) }}</a>
      <span v-else-if="chain.txHash" class="hash block" :title="chain.txHash">{{ shortId(chain.txHash) }}</span>
    </template>
    <template v-else>{{ t(`inbox.chain.${chain.status}`) }}</template>
  </span>
</template>

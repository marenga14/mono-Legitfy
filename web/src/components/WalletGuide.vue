<script setup lang="ts">
import { ShieldAlert } from "lucide-vue-next";
import { ref } from "vue";
import { t } from "../lib/i18n";
import { addNetworkToWallet, hasWallet } from "../lib/wallet";

const message = ref("");
async function addNetwork() {
  message.value = "";
  try {
    await addNetworkToWallet();
    message.value = t("wallet.added");
  } catch (e) {
    message.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="text-xl">{{ t("wallet.setupTitle") }}</h3>
      <p class="mt-1 text-ink-soft">{{ t("wallet.setupSub") }}</p>
      <ol class="mt-4 list-decimal space-y-3 pl-5">
        <li><a class="link" href="https://metamask.io/download/" target="_blank" rel="noopener">{{ t("wallet.step1") }}</a> {{ t("wallet.step1Body") }}</li>
        <li>{{ t("wallet.step2") }}</li>
        <li>{{ t("wallet.step3") }}</li>
        <li>{{ t("wallet.step4") }}</li>
        <li>
          {{ t("wallet.step5") }}
          <button v-if="hasWallet()" type="button" class="btn btn-quiet mt-2 flex" @click="addNetwork">{{ t("wallet.addNetwork") }}</button>
          <p v-if="message" class="mt-2 text-sm text-ink-soft" role="status">{{ message }}</p>
        </li>
      </ol>
      <p class="mt-3 text-sm text-ink-soft">{{ t("wallet.phone") }}</p>
    </div>
    <div>
      <h3 class="flex items-center gap-2 text-xl"><ShieldAlert class="size-5 text-caution" aria-hidden="true" />{{ t("wallet.safetyTitle") }}</h3>
      <ul class="mt-3 list-disc space-y-2 pl-5">
        <li v-for="n in [1, 2, 3, 4, 5, 6]" :key="n">{{ t(`wallet.safety${n}`) }}</li>
      </ul>
    </div>
  </div>
</template>

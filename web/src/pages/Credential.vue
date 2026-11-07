<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import Fingerprint from "../components/Fingerprint.vue";
import VerdictPanel from "../components/VerdictPanel.vue";
import { t } from "../lib/i18n";
import { registryConnected, resolveCredential, verifyById, type Verdict } from "../lib/registry";

const target = resolveCredential(String(useRoute().params.id));
const verdict = ref<Verdict | null>(null);
const error = ref("");
onMounted(async () => {
  if (!target) {
    error.value = t("errors.badLink");
    return;
  }
  try {
    verdict.value = await verifyById(target.id);
  } catch {
    error.value = t(registryConnected ? "errors.recordUnreachableShort" : "errors.registryOff");
  }
});
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-14">
    <h1 class="sr-only">{{ t("credential.heading") }}</h1>
    <div v-if="verdict" class="glass grid gap-6 p-7 sm:grid-cols-[1fr_9rem]">
      <VerdictPanel :verdict="verdict" :code="target?.code ?? undefined" />
      <Fingerprint v-if="verdict.status !== 'not_found'" :hash="verdict.fileHash" class="size-36 text-periwinkle" />
    </div>
    <p v-else-if="error" class="text-seal">{{ error }}</p>
    <p v-else>{{ t("credential.reading") }}</p>
  </section>
</template>

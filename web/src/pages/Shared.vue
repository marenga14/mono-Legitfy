<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../lib/api";
import { statusLabel } from "../lib/certificate";
import { dateLocale, t } from "../lib/i18n";

interface Shared {
  recipient: string; comment: string; expires_at: string; owner_name: string; title: string;
  description: string; file_name: string; institution: string; status: string;
}
const token = String(useRoute().params.token);
const r = ref<Shared | null>(null);
const error = ref("");
const fileUrl = ref("");
const label = computed(() => (r.value ? statusLabel(r.value.status) : ""));

onMounted(async () => {
  try {
    r.value = await api(`/shared/${token}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
});
async function open() {
  try {
    fileUrl.value = URL.createObjectURL(await api<Blob>(`/shared/${token}/file`));
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onBeforeUnmount(() => fileUrl.value && URL.revokeObjectURL(fileUrl.value));
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-12">
    <p v-if="error" class="glass p-5 text-seal" role="alert">{{ error }}</p>
    <template v-if="r">
      <h1 class="text-5xl">{{ r.title }}</h1>
      <p class="mt-3 text-lg text-ink-soft">{{ t("shared.body", { institution: r.institution, owner: r.owner_name, recipient: r.recipient }) }}</p>
      <dl class="glass mt-8 grid gap-4 p-6 sm:grid-cols-2">
        <div><dt class="text-sm text-ink-soft">{{ t("shared.record") }}</dt><dd class="font-semibold">{{ label }}</dd></div>
        <div><dt class="text-sm text-ink-soft">{{ t("shared.expires") }}</dt><dd class="font-semibold">{{ new Date(r.expires_at).toLocaleDateString(dateLocale(), { dateStyle: "long" }) }}</dd></div>
        <div v-if="r.description" class="sm:col-span-2"><dt class="text-sm text-ink-soft">{{ t("shared.description") }}</dt><dd>{{ r.description }}</dd></div>
        <div v-if="r.comment" class="sm:col-span-2"><dt class="text-sm text-ink-soft">{{ t("shared.note") }}</dt><dd>{{ r.comment }}</dd></div>
      </dl>
      <button v-if="!fileUrl" class="btn mt-6" @click="open">{{ t("shared.open", { file: r.file_name }) }}</button>
      <iframe v-else :src="fileUrl" :title="r.file_name" class="mt-6 h-[40rem] w-full rounded-lg bg-white"></iframe>
    </template>
    <p v-else-if="!error">{{ t("shared.opening") }}</p>
  </section>
</template>

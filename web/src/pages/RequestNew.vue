<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api";
import { currentLocale, t } from "../lib/i18n";

const router = useRouter();
const institutions = ref<{ id: number; name: string }[]>([]);
const form = reactive({ institutionId: "", requesterOrg: "", requesterEmail: "", subject: "", purpose: "", consentAgent: false });
const file = ref<File>();
const error = ref("");
const busy = ref(false);

onMounted(async () => {
  try {
    institutions.value = await api("/institutions");
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function submit() {
  error.value = "";
  if (!file.value) return (error.value = t("errors.attachPdf"));
  busy.value = true;
  try {
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) body.set(k, String(v));
    body.set("locale", currentLocale());
    body.set("file", file.value);
    const { trackingToken } = await api<{ trackingToken: string }>("/requests", { method: "POST", body });
    router.push({ path: `/track/${trackingToken}`, query: { sent: "1" } });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="text-5xl">{{ t("request.title") }}</h1>
    <p class="mt-3 text-ink-soft">{{ t("request.sub") }}</p>
    <form class="glass mt-8 space-y-5 p-7" @submit.prevent="submit">
      <div>
        <label for="institution">{{ t("request.institution") }}</label>
        <select id="institution" v-model="form.institutionId" class="field mt-1" required>
          <option value="" disabled>{{ t("request.choose") }}</option>
          <option v-for="i in institutions" :key="i.id" :value="i.id">{{ i.name }}</option>
        </select>
      </div>
      <label class="block">{{ t("request.org") }}<input v-model="form.requesterOrg" class="field mt-1" required minlength="2" maxlength="200" autocomplete="organization" /></label>
      <label class="block">{{ t("request.email") }}<input v-model="form.requesterEmail" type="email" class="field mt-1" required autocomplete="email" /></label>
      <label class="block">{{ t("request.subject") }}<input v-model="form.subject" class="field mt-1" required minlength="3" maxlength="200" :placeholder="t('request.subjectHint')" /></label>
      <label class="block">{{ t("request.purpose") }}<textarea v-model="form.purpose" class="field mt-1" rows="3" required minlength="3" maxlength="2000"></textarea></label>
      <label class="block">{{ t("request.file") }}
        <input type="file" accept="application/pdf" class="field mt-1" required @change="file = ($event.target as HTMLInputElement).files?.[0]" />
      </label>
      <label class="flex items-start gap-3">
        <input v-model="form.consentAgent" type="checkbox" class="mt-1.5 size-4 accent-stamp" />
        <span>{{ t("request.consent") }}</span>
      </label>
      <p v-if="error" class="text-seal" role="alert">{{ error }}</p>
      <button class="btn" :disabled="busy">{{ busy ? t("request.sending") : t("request.send") }}</button>
    </form>
  </section>
</template>

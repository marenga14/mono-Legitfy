<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import type { Address } from "viem";
import DetailField from "../../components/console/DetailField.vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { i18n, LOCALES, t, type Locale } from "../../lib/i18n";
import { canWrite, registerInstitution } from "../../lib/wallet";

interface Application {
  id: string; institution_name: string; registration_number: string; institution_type: string; country: string; city: string;
  website: string; official_email: string; phone: string; applicant_name: string; applicant_position: string; applicant_email: string;
  signatory_name: string; signatory_title: string; wallet: string; status: string; mandate_type: string | null; identity_document: string | null;
  review_reason: string | null; on_chain: boolean; locale: string;
}
type Kind = "registration" | "mandate";
const id = String(useRoute().params.id);
const a = ref<Application | null>(null);
const error = ref("");
const busy = ref(false);
const reason = ref("");
const note = ref("");
/** Ready-made reasons, written in the applicant's language because that's how the email goes out. */
const TEMPLATES = ["document", "number", "letter", "identity", "eligible", "duplicate"] as const;
const useTemplate = (k: (typeof TEMPLATES)[number]) => {
  const locale = (LOCALES.find((l) => l.code === a.value?.locale)?.code ?? "en") as Locale;
  reason.value = i18n.global.t(`applications.templates.${k}.text`, {}, { locale });
};
const recipients = computed(() => [...new Set([a.value?.applicant_email, a.value?.official_email].filter(Boolean))].join(", "));
const urls = reactive<Partial<Record<Kind, string>>>({});
const ticked = ref<number[]>([]);
const open = computed(() => a.value?.status === "under_review" || a.value?.status === "awaiting_mandate");
/** Applications from before IDs were required have none to check. */
const checks = computed(() => (a.value?.identity_document ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]));
/** Rejecting erases the files as well as the personal details. */
const kinds = computed<Kind[]>(() => (a.value?.status === "rejected" ? [] : ["registration", "mandate"]));
const identityNumber = ref("");
const ready = computed(() => ticked.value.length === checks.value.length && a.value?.status === "under_review");

async function load() {
  a.value = await api(`/platform/applications/${id}`);
}
onMounted(() => load().catch((e) => (error.value = e.message)));
onBeforeUnmount(() => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)));

async function attempt(work: () => Promise<unknown>) {
  error.value = "";
  busy.value = true;
  try {
    await work();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
const showIdentity = () => attempt(async () => {
  identityNumber.value = (await api<{ number: string }>(`/platform/applications/${id}/identity`)).number;
});
const view = (kind: Kind) => attempt(async () => {
  urls[kind] = URL.createObjectURL(await api<Blob>(`/platform/applications/${id}/files/${kind}`));
});
/** Checks the chain first, so a retry after a failed save can't try to register twice. */
const approve = () => attempt(async () => {
  await load();
  if (!a.value!.on_chain) await registerInstitution(a.value!.institution_name, a.value!.wallet as Address);
  await api(`/platform/applications/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note.value }) });
});
const reject = () => attempt(() => api(`/platform/applications/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason.value }) }));
</script>

<template>
  <PageHead :title="a?.institution_name ?? t('applications.title')" back="/app/platform/applications" :back-label="t('applications.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <div v-if="a" class="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
    <div class="space-y-4">
      <dl class="panel grid gap-4 p-5 sm:grid-cols-2">
        <DetailField :label="t('common.status')" :value="t(`applications.status.${a.status}`)" />
        <DetailField :label="t('apply.number')" :value="a.registration_number" />
        <DetailField :label="t('apply.type')" :value="t(`applications.types.${a.institution_type}`)" />
        <DetailField :label="t('platform.location')" :value="`${a.city}, ${a.country}`" />
        <DetailField v-if="a.official_email" :label="t('apply.email')"><a class="link" :href="`mailto:${a.official_email}`">{{ a.official_email }}</a></DetailField>
        <DetailField v-if="a.phone" :label="t('apply.phone')" :value="a.phone" />
        <DetailField v-if="a.website" class="sm:col-span-2" :label="t('apply.website')" :value="a.website" />
        <DetailField v-if="a.applicant_name" :label="t('applications.applicant')" :value="`${a.applicant_name}, ${a.applicant_position}`" />
        <DetailField v-if="a.applicant_email" :label="t('apply.applicantEmail')"><a class="link" :href="`mailto:${a.applicant_email}`">{{ a.applicant_email }}</a></DetailField>
        <DetailField v-if="a.identity_document" :label="t('apply.identityDocument')" :value="t(`applications.ids.${a.identity_document}`)" />
        <DetailField v-if="a.identity_document" :label="t('apply.identityNumber')">
          <span v-if="identityNumber" class="hash">{{ identityNumber }}</span>
          <button v-else class="btn btn-quiet" :disabled="busy" @click="showIdentity">{{ t("applications.showIdentity") }}</button>
        </DetailField>
        <DetailField v-if="a.signatory_name" :label="t('applications.signatory')" :value="`${a.signatory_name}, ${a.signatory_title}`" />
        <DetailField v-if="a.wallet" class="sm:col-span-2" :label="t('platform.adminWallet')"><span class="hash break-all">{{ a.wallet }}</span></DetailField>
      </dl>
      <p v-if="a.status === 'rejected'" class="panel p-5 text-ink-soft">{{ t("applications.erased") }}</p>
      <div v-else class="panel flex flex-wrap gap-3 p-5">
        <template v-for="kind in kinds" :key="kind">
          <a v-if="urls[kind]" class="btn btn-quiet" :href="urls[kind]" target="_blank" rel="noopener">{{ t(`applications.open.${kind}`) }}</a>
          <button v-else-if="kind !== 'mandate' || a.mandate_type" class="btn btn-quiet" :disabled="busy" @click="view(kind)">{{ t(`applications.load.${kind}`) }}</button>
          <p v-else class="self-center text-ink-soft">{{ t("applications.noLetter") }}</p>
        </template>
      </div>
    </div>

    <div v-if="open" class="space-y-4">
      <form class="panel space-y-3 p-5" @submit.prevent="approve">
        <h2 class="text-xl">{{ t("applications.checksTitle") }}</h2>
        <label v-for="n in checks" :key="n" class="flex items-start gap-2">
          <input v-model="ticked" type="checkbox" :value="n" class="mt-1 size-4 accent-stamp" />
          <span>{{ t(`applications.check${n}`) }}</span>
        </label>
        <label class="block">{{ t("applications.noteLabel") }}<textarea v-model="note" class="field mt-1" rows="3" maxlength="1000" :placeholder="t('applications.notePlaceholder')"></textarea></label>
        <p v-if="recipients" class="text-sm text-ink-soft">{{ t("applications.emailedTo", { to: recipients }) }}</p>
        <p class="text-sm text-ink-soft">{{ t("applications.permanent") }}</p>
        <button class="btn" :disabled="busy || !ready || !canWrite()">{{ busy ? t("common.waitingWallet") : t("applications.approve") }}</button>
      </form>
      <form class="panel space-y-3 p-5" @submit.prevent="reject">
        <div>
          <p class="text-sm font-semibold">{{ t("applications.templatesTitle") }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button v-for="k in TEMPLATES" :key="k" type="button" class="rounded-full border border-line px-3 py-1 text-sm hover:bg-paper-deep" @click="useTemplate(k)">{{ t(`applications.templates.${k}.label`) }}</button>
          </div>
        </div>
        <label class="block">{{ t("applications.rejectReason") }}<textarea v-model="reason" class="field mt-1" rows="4" required minlength="3" maxlength="1000"></textarea></label>
        <p v-if="recipients" class="text-sm text-ink-soft">{{ t("applications.emailedTo", { to: recipients }) }}</p>
        <p class="text-sm text-ink-soft">{{ t("applications.rejectNote") }}</p>
        <button class="btn btn-quiet" :disabled="busy">{{ t("applications.reject") }}</button>
      </form>
    </div>
    <p v-else-if="a.review_reason" class="panel p-5"><span class="font-semibold">{{ t("track2.reason") }}</span><br />{{ a.review_reason }}</p>
  </div>
</template>

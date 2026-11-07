<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { Download, Eye, Share2, UploadCloud } from "lucide-vue-next";
import DetailField from "../../components/console/DetailField.vue";
import PageHead from "../../components/console/PageHead.vue";
import Fingerprint from "../../components/Fingerprint.vue";
import { api } from "../../lib/api";
import { longDate, statusLabel } from "../../lib/certificate";
import { dateLocale, t } from "../../lib/i18n";
import { canWrite, issue } from "../../lib/wallet";
import type { Hex } from "viem";

interface Share { id: string; recipient: string; comment: string; shared_by: string; expires_at: string; revoked_at: string | null; created_at: string }
interface Doc {
  id: string; code: string | null; sealed: boolean; owner_name: string; title: string; description: string; file_name: string;
  file_sha256: string; created_at: string; status: string; shares: Share[];
}
const id = String(useRoute().params.id);
const doc = ref<Doc | null>(null);
const error = ref("");
const fileUrl = ref("");
const publishing = ref(false);
const dialog = ref<HTMLDialogElement>();
const share = reactive({ recipient: "", comment: "", expiresInDays: 14 });
const link = ref("");
const copied = ref(false);
const hash = computed(() => `0x${doc.value?.file_sha256}` as Hex);

async function load() {
  try {
    doc.value = await api(`/credentials/${id}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
onBeforeUnmount(() => fileUrl.value && URL.revokeObjectURL(fileUrl.value));

async function attempt(work: () => Promise<unknown>) {
  error.value = "";
  try {
    await work();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
const open = () => attempt(async () => (fileUrl.value = URL.createObjectURL(await api<Blob>(`/credentials/${id}/file`))));
const download = () => attempt(async () => {
  const url = URL.createObjectURL(await api<Blob>(`/credentials/${id}/file`));
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.value!.sealed ? `${doc.value!.file_name.replace(/\.pdf$/i, "")}-stamped.pdf` : doc.value!.file_name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});
async function publish() {
  publishing.value = true;
  await attempt(async () => {
    await issue(id as Hex, hash.value);
    await load();
  });
  publishing.value = false;
}
function startShare() {
  Object.assign(share, { recipient: "", comment: "", expiresInDays: 14 });
  link.value = "";
  copied.value = false;
  dialog.value?.showModal();
}
const createShare = () => attempt(async () => {
  const { token } = await api<{ token: string }>(`/credentials/${id}/shares`, { method: "POST", body: JSON.stringify(share) });
  link.value = `${location.origin}/shared/${token}`;
  await load();
});
async function copy() {
  await navigator.clipboard.writeText(link.value);
  copied.value = true;
}
const withdraw = (s: Share) => attempt(async () => {
  await api(`/credentials/${id}/shares/${s.id}/revoke`, { method: "POST", body: "{}" });
  await load();
});
const shareState = (s: Share) => (s.revoked_at ? "withdrawn" : new Date(s.expires_at) < new Date() ? "expired" : "active");
const stamp = (d: string) => new Date(d).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <PageHead :title="t('document.title')" back="/app/documents" :back-label="t('document.back')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <template v-if="doc">
    <section class="panel mt-4 grid gap-6 p-5 lg:grid-cols-[1fr_10rem]">
      <dl class="grid content-start gap-4 sm:grid-cols-2">
        <DetailField :label="t('document.name')" :value="`${doc.owner_name}-${doc.title}`" />
        <DetailField :label="t('document.created')" :value="longDate(doc.created_at)" />
        <DetailField v-if="doc.description" class="sm:col-span-2" :label="t('document.description')" :value="doc.description" />
        <DetailField :label="t('document.record')" :value="statusLabel(doc.status)" />
        <DetailField :label="t('document.file')" :value="doc.file_name" />
        <DetailField class="sm:col-span-2" :label="t('document.id')"><span class="hash" :title="doc.id">{{ doc.code ?? doc.id }}</span></DetailField>
        <DetailField class="sm:col-span-2" :label="t('document.fingerprint')"><span class="hash">{{ hash }}</span></DetailField>
      </dl>
      <Fingerprint :hash="hash" class="mx-auto size-36 text-harbour" />
      <div class="lg:col-span-2">
        <h2 class="text-sm font-semibold">{{ t("document.actions") }}</h2>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn btn-quiet" @click="open"><Eye class="size-4" aria-hidden="true" />{{ t("document.open") }}</button>
          <button class="btn" @click="download"><Download class="size-4" aria-hidden="true" />{{ t(doc.sealed ? "document.download" : "document.downloadPlain") }}</button>
          <button class="btn" @click="startShare"><Share2 class="size-4" aria-hidden="true" />{{ t("document.share") }}</button>
          <button v-if="doc.status === 'pending' && canWrite()" class="btn" :disabled="publishing" @click="publish"><UploadCloud class="size-4" aria-hidden="true" />{{ publishing ? t("common.waitingWallet") : t("document.publish") }}</button>
        </div>
        <p class="mt-3 max-w-prose text-sm text-ink-soft">{{ t(doc.sealed ? "document.stampedNote" : "document.unsealedNote") }}</p>
        <p v-if="doc.status === 'pending'" class="mt-3 max-w-prose text-sm text-ink-soft">{{ canWrite() ? t("document.pending") : t("errors.smartAccount") }}</p>
      </div>
      <iframe v-if="fileUrl" :src="fileUrl" :title="doc.file_name" class="h-[36rem] w-full rounded border border-[#cfd8de] lg:col-span-2"></iframe>
    </section>

    <section class="panel mt-4 p-5">
      <h2 class="text-lg">{{ t("document.shares") }}</h2>
      <p v-if="doc.shares.length === 0" class="mt-2 text-ink-soft">{{ t("document.noShares") }}</p>
      <ol class="mt-4 space-y-4 border-l-[3px] border-harbour pl-4">
        <li v-for="s in doc.shares" :key="s.id" class="overflow-hidden rounded-md border border-line">
          <p class="bg-gradient px-3 py-1.5 font-semibold">{{ stamp(s.created_at) }}</p>
          <dl class="grid gap-x-8 gap-y-1 p-3 text-sm sm:grid-cols-2">
            <div><dt class="inline font-semibold">{{ t("document.to") }}</dt><dd class="inline">{{ s.recipient }}</dd></div>
            <div><dt class="inline font-semibold">{{ t("document.from") }}</dt><dd class="hash inline">{{ s.shared_by }}</dd></div>
            <div><dt class="inline font-semibold">{{ t("document.status") }}</dt><dd class="inline">{{ t(`document.${shareState(s)}`) }}</dd></div>
            <div><dt class="inline font-semibold">{{ t("document.expires") }}</dt><dd class="inline">{{ stamp(s.expires_at) }}</dd></div>
            <div v-if="s.comment" class="sm:col-span-2"><dt class="inline font-semibold">{{ t("document.comment") }}</dt><dd class="inline">{{ s.comment }}</dd></div>
          </dl>
          <div v-if="shareState(s) === 'active'" class="px-3 pb-3"><button class="btn btn-quiet min-h-9! text-sm!" @click="withdraw(s)">{{ t("document.withdraw") }}</button></div>
        </li>
      </ol>
    </section>
  </template>

  <dialog ref="dialog" class="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg p-0 backdrop:bg-harbour-deep/50">
    <div v-if="link" class="space-y-3 p-6">
      <h2 class="text-xl">{{ t("document.linkCreated") }}</h2>
      <p>{{ t("document.copyNow") }}</p>
      <p class="hash rounded bg-paper p-3" data-testid="share-link">{{ link }}</p>
      <div class="flex justify-end gap-3">
        <button class="btn btn-quiet" @click="dialog?.close()">{{ t("common.close") }}</button>
        <button class="btn" @click="copy">{{ copied ? t("document.copied") : t("document.copy") }}</button>
      </div>
    </div>
    <form v-else class="space-y-4 p-6" @submit.prevent="createShare">
      <h2 class="text-xl">{{ t("document.shareTitle") }}</h2>
      <label class="block">{{ t("document.who") }}<input v-model="share.recipient" class="field mt-1" required minlength="2" maxlength="200" /></label>
      <label class="block">{{ t("document.commentLabel") }}<textarea v-model="share.comment" class="field mt-1" rows="2" maxlength="1000"></textarea></label>
      <label class="block">{{ t("document.days") }}<input v-model.number="share.expiresInDays" type="number" min="1" max="90" class="field mt-1" required /></label>
      <p v-if="error" class="text-seal" role="alert">{{ error }}</p>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-quiet" @click="dialog?.close()">{{ t("common.cancel") }}</button>
        <button class="btn">{{ t("document.createLink") }}</button>
      </div>
    </form>
  </dialog>
</template>

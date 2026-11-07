<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { Plus } from "lucide-vue-next";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { longDate, shortId, stampCertificate, statusLabel } from "../../lib/certificate";
import { credentialIdFor, newCertificateCode } from "../../lib/certificateCode";
import { sha256File } from "../../lib/hash";
import { loadSealFiles, type SealImageFlags } from "../../lib/sealFiles";
import type { SealStyle } from "../../lib/sealStyles";
import { t } from "../../lib/i18n";
import { canWrite, issue } from "../../lib/wallet";

interface Row { id: string; code: string | null; owner_name: string; title: string; created_at: string; status: string }
const router = useRouter();
const rows = ref<Row[] | null>(null);
const error = ref("");
const dialog = ref<HTMLDialogElement>();
const form = reactive({ ownerName: "", title: "", description: "" });
const file = ref<File>();
const withSeal = ref(true);
const step = ref("");
const formError = ref("");

onMounted(async () => {
  try {
    rows.value = await api("/credentials");
  } catch (e) {
    error.value = (e as Error).message;
  }
});

function start(chosen?: File) {
  file.value = chosen;
  withSeal.value = true;
  formError.value = "";
  dialog.value?.showModal();
}

async function create() {
  if (!file.value) return;
  formError.value = "";
  try {
    step.value = t("documents.stamping");
    const { institution, seal, sealImages } = await api<{ institution: string; seal: SealStyle; sealImages: SealImageFlags }>("/me");
    const code = newCertificateCode(institution);
    const id = credentialIdFor(code);
    // Without a seal the file stays exactly as uploaded, so that copy is the one that verifies.
    const final = withSeal.value ? await stampCertificate(file.value, code, institution, seal, await loadSealFiles(sealImages)) : file.value;
    const hash = await sha256File(final);
    step.value = t("documents.saving");
    const body = new FormData();
    body.set("code", code);
    for (const [k, v] of Object.entries(form)) body.set(k, v);
    body.set("sealed", String(withSeal.value));
    body.set("file", final);
    await api("/credentials", { method: "POST", body });
    if (canWrite()) {
      step.value = t("common.waitingWallet");
      // Saved already: if this step fails, Document details offers to publish again.
      await issue(id, hash).catch(() => undefined);
    }
    router.push(`/app/documents/${id}`);
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    step.value = "";
  }
}
</script>

<template>
  <PageHead :title="t('documents.title')">
    <button class="btn btn-quiet" @click="start()"><Plus class="size-4" aria-hidden="true" />{{ t("documents.create") }}</button>
  </PageHead>
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>

  <div class="console-banner mt-4 p-6">
    <button
      class="grid h-28 w-40 place-items-center rounded relative z-1 border-2 border-dashed border-white/60 bg-white/10 text-white hover:bg-white/20"
      :aria-label="t('documents.create')"
      @click="start()"
      @dragover.prevent
      @drop.prevent="start($event.dataTransfer?.files[0])"
    ><Plus class="size-8" aria-hidden="true" /></button>
  </div>

  <p v-if="rows?.length === 0" class="panel mt-4 p-6">{{ t("documents.empty") }}</p>
  <div v-if="rows?.length" class="panel mt-4 overflow-x-auto" tabindex="0" role="region" :aria-label="t('documents.table')">
    <table class="data-table">
      <thead class="bg-gradient"><tr><th>{{ t("common.no") }}</th><th>{{ t("documents.id") }}</th><th>{{ t("documents.owner") }}</th><th>{{ t("documents.created") }}</th><th>{{ t("documents.purpose") }}</th><th>{{ t("common.status") }}</th><th>{{ t("common.actions") }}</th></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="r.id">
          <td>{{ i + 1 }}</td>
          <td class="hash" :title="r.id">{{ r.code ?? shortId(r.id) }}</td>
          <td>{{ r.owner_name }}</td>
          <td class="whitespace-nowrap">{{ longDate(r.created_at) }}</td>
          <td>{{ r.title }}</td>
          <td class="whitespace-nowrap">{{ statusLabel(r.status) }}</td>
          <td><RouterLink :to="`/app/documents/${r.id}`" class="btn btn-view" :aria-label="t('documents.viewItem', { owner: r.owner_name, title: r.title })">{{ t("common.view") }}</RouterLink></td>
        </tr>
      </tbody>
    </table>
  </div>

  <dialog ref="dialog" class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg p-0 backdrop:bg-harbour-deep/50">
    <form class="space-y-4 p-6" @submit.prevent="create">
      <h2 class="text-xl">{{ t("documents.create") }}</h2>
      <label class="block">{{ t("documents.owner") }}<input v-model="form.ownerName" class="field mt-1" required minlength="2" maxlength="200" /></label>
      <label class="block">{{ t("documents.purpose") }}<input v-model="form.title" class="field mt-1" required minlength="2" maxlength="200" :placeholder="t('documents.purposeHint')" /></label>
      <label class="block">{{ t("documents.description") }}<textarea v-model="form.description" class="field mt-1" rows="2" maxlength="2000"></textarea></label>
      <label class="block">{{ t("documents.file") }}
        <input type="file" accept="application/pdf" class="field mt-1" :required="!file" @change="file = ($event.target as HTMLInputElement).files?.[0]" />
      </label>
      <p v-if="file" class="text-sm text-ink-soft">{{ file.name }}</p>
      <label class="flex items-center gap-2"><input v-model="withSeal" type="checkbox" class="size-4" />{{ t("documents.addSeal") }}</label>
      <p class="text-sm text-ink-soft">{{ t(withSeal ? "documents.stampNote" : "documents.noSealNote") }}</p>
      <p v-if="formError" class="text-seal" role="alert">{{ formError }}</p>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-quiet" :disabled="!!step" @click="dialog?.close()">{{ t("common.cancel") }}</button>
        <button class="btn" :disabled="!!step">{{ step || t("documents.create") }}</button>
      </div>
    </form>
  </dialog>
</template>

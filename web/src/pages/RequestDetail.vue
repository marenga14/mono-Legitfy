<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import PageHead from "../components/console/PageHead.vue";
import { OUTCOMES } from "../lib/outcomes";
import ChainRecord, { type ChainProof } from "../components/console/ChainRecord.vue";
import { api } from "../lib/api";
import { dateLocale, t, te } from "../lib/i18n";

interface Triage {
  documentType: string; claimedIssuer: string | null; credentialTitle: string | null; issueDate: string | null;
  referenceNumber: string | null; summary: string; riskLevel: string; riskFlags: { code: string; explanation: string }[]; confidence: number;
}
interface Req {
  id: string; subject: string; purpose: string; requester_org: string; requester_email: string; status: string; level: number;
  escalation_reason: string | null; registry_status: string; registry_institution: string | null; registry_other_issuer: boolean; triage_status: string;
  triage: Triage | null; consent_agent: boolean; file_name: string; answer_outcome: string | null; answer_note: string | null; receipt_hash: string | null; answered_at: string | null; answered_by: string | null;
  answered_by_name: string; answered_by_position: string; chain: ChainProof | null;
}
const level = (n: number) => t(`levels.${n}`);
const actionLabel = (action: string) => {
  const key = `detail.actions.${action.replace(".", "_")}`;
  return te(key) ? t(key) : action;
};

const id = String(useRoute().params.id);
const r = ref<Req | null>(null);
const log = ref<{ action: string; actor: string; created_at: string; actor_name: string | null }[]>([]);
const fileUrl = ref("");
const error = ref("");
const answer = reactive({ outcome: "confirmed", note: "" });
const escalating = ref(false);
const reason = ref("");

async function load() {
  try {
    r.value = await api<Req>(`/requests/${id}`);
    log.value = await api(`/requests/${id}/audit`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function act(path: string, body: unknown) {
  error.value = "";
  try {
    await api(`/requests/${id}/${path}`, { method: "POST", body: JSON.stringify(body) });
    await load();
    return true;
  } catch (e) {
    error.value = (e as Error).message;
    return false;
  }
}
async function openFile() {
  try {
    fileUrl.value = URL.createObjectURL(await api<Blob>(`/requests/${id}/file`));
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function escalate() {
  if (await act("escalate", { reason: reason.value })) {
    escalating.value = false;
    reason.value = "";
  }
}
onMounted(load);
onBeforeUnmount(() => fileUrl.value && URL.revokeObjectURL(fileUrl.value));

const agentNote = computed(() => {
  if (!r.value) return "";
  if (r.value.triage) return "";
  if (!r.value.consent_agent) return t("detail.noConsent");
  return t(r.value.triage_status === "unavailable" ? "detail.agentFailed" : "detail.agentOff");
});
</script>

<template>
  <PageHead :title="r?.subject ?? t('titles.requestDetail')" back="/app/inbox" :back-label="t('inbox.title')" />
  <section>
    <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
    <div v-if="r" class="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div class="panel p-5">
        <p class="mt-2 text-ink-soft">{{ t("detail.from", { org: r.requester_org, level: level(r.level) }) }} <a class="link" :href="`mailto:${r.requester_email}`">{{ r.requester_email }}</a></p>
        <p v-if="r.escalation_reason" class="mt-2 font-semibold text-seal">{{ r.escalation_reason }}</p>
        <p class="mt-4 max-w-prose whitespace-pre-line">{{ r.purpose }}</p>

        <h2 class="mt-6 text-xl">{{ t("detail.publicRecord") }}</h2>
        <p class="mt-2">{{ t(`detail.registry.${r.registry_status}`) }}</p>
        <p v-if="r.registry_other_issuer" class="mt-2 font-semibold text-seal">{{ t("detail.registryOther", { institution: r.registry_institution }) }}</p>

        <h2 class="mt-6 text-xl">{{ t("detail.agent") }}</h2>
        <p v-if="agentNote" class="mt-2 text-ink-soft">{{ agentNote }}</p>
        <template v-if="r.triage">
          <p class="mt-1 text-ink-soft">{{ t("detail.prompt", { n: Math.round(r.triage.confidence * 100) }) }}</p>
          <p class="mt-3 max-w-prose">{{ r.triage.summary }}</p>
          <dl class="mt-4 grid max-w-xl grid-cols-[9rem_1fr] gap-y-1">
            <dt class="text-ink-soft">{{ t("detail.claimedIssuer") }}</dt><dd>{{ r.triage.claimedIssuer ?? t("detail.notStated") }}</dd>
            <dt class="text-ink-soft">{{ t("detail.docTitle") }}</dt><dd>{{ r.triage.credentialTitle ?? t("detail.notStated") }}</dd>
            <dt class="text-ink-soft">{{ t("detail.date") }}</dt><dd>{{ r.triage.issueDate ?? t("detail.notStated") }}</dd>
            <dt class="text-ink-soft">{{ t("detail.reference") }}</dt><dd>{{ r.triage.referenceNumber ?? t("detail.notStated") }}</dd>
          </dl>
          <ul v-if="r.triage.riskFlags.length" class="mt-4 space-y-1">
            <li v-for="f in r.triage.riskFlags" :key="f.code" class="text-seal">{{ f.explanation }}</li>
          </ul>
        </template>

        <h2 class="mt-6 text-xl">{{ t("detail.document") }}</h2>
        <button v-if="!fileUrl" class="btn btn-quiet mt-3" @click="openFile">{{ t("detail.open", { file: r.file_name }) }}</button>
        <iframe v-else :src="fileUrl" :title="r.file_name" class="mt-3 h-[34rem] w-full border border-ink/30 bg-white"></iframe>
      </div>

      <aside class="panel self-start p-5">
        <div v-if="r.status === 'answered'">
          <h2 class="text-xl">{{ t("detail.answered") }}</h2>
          <p class="mt-2">{{ t(OUTCOMES[r.answer_outcome!]!) }}</p>
          <p v-if="r.answer_note" class="mt-2 whitespace-pre-line">{{ r.answer_note }}</p>
          <dl class="mt-3 space-y-2">
            <div><dt class="text-sm font-semibold">{{ t("inbox.resolvedBy") }}</dt><dd>{{ r.answered_by_name || r.answered_by }}<template v-if="r.answered_by_position">, {{ r.answered_by_position }}</template></dd></div>
            <div><dt class="text-sm font-semibold">{{ t("inbox.resolvedAt") }}</dt><dd>{{ new Date(r.answered_at!).toLocaleString(dateLocale()) }}</dd></div>
            <div><dt class="text-sm font-semibold">{{ t("inbox.onChain") }}</dt><dd><ChainRecord v-if="r.chain" :chain="r.chain" /></dd></div>
          </dl>
          <p class="mt-3 text-sm text-ink-soft">{{ t("inbox.chainNote") }}</p>
          <p class="mt-3 text-ink-soft">{{ t("detail.receipt") }} <span class="hash">{{ r.receipt_hash }}</span></p>
        </div>
        <form v-else class="space-y-4" @submit.prevent="act('answer', answer)">
          <h2 class="text-xl">{{ t("detail.yourAnswer") }}</h2>
          <fieldset class="space-y-1">
            <legend class="sr-only">{{ t("detail.outcome") }}</legend>
            <label class="flex gap-2"><input v-model="answer.outcome" type="radio" value="confirmed" class="accent-stamp" />{{ t("detail.confirm") }}</label>
            <label class="flex gap-2"><input v-model="answer.outcome" type="radio" value="not_confirmed" class="accent-stamp" />{{ t("detail.dontConfirm") }}</label>
            <label class="flex gap-2"><input v-model="answer.outcome" type="radio" value="needs_information" class="accent-stamp" />{{ t("detail.askMore") }}</label>
          </fieldset>
          <label class="block">{{ t("detail.note") }}
            <textarea v-model="answer.note" class="field mt-1" rows="3" maxlength="2000" :required="answer.outcome !== 'confirmed'"></textarea>
          </label>
          <div class="flex flex-wrap gap-3">
            <button class="btn">{{ t("detail.send") }}</button>
            <button v-if="r.status === 'received'" type="button" class="btn btn-quiet" @click="act('claim', {})">{{ t("detail.claim") }}</button>
            <button v-if="r.level < 3" type="button" class="btn btn-quiet" @click="escalating = !escalating">{{ t("detail.escalate") }}</button>
          </div>
        </form>
        <form v-if="escalating" class="mt-4 space-y-3" @submit.prevent="escalate">
          <label class="block">{{ t("detail.why") }}<textarea v-model="reason" class="field mt-1" rows="2" required minlength="3"></textarea></label>
          <button class="btn">{{ t("detail.escalateTo", { level: level(r.level + 1) }) }}</button>
        </form>

        <h2 class="mt-8 text-xl">{{ t("detail.history") }}</h2>
        <ol class="mt-3 space-y-2">
          <li v-for="(e, i) in log" :key="i">
            {{ actionLabel(e.action) }}
            <span class="block text-sm text-ink-soft">{{ new Date(e.created_at).toLocaleString(dateLocale()) }}<template v-if="e.actor_name"> · {{ e.actor_name }}</template></span>
          </li>
        </ol>
      </aside>
    </div>
  </section>
</template>

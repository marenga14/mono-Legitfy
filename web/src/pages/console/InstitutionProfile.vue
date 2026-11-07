<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import CountrySelect from "../../components/CountrySelect.vue";
import DistrictSelect from "../../components/DistrictSelect.vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { longDate } from "../../lib/certificate";
import { t } from "../../lib/i18n";

const TYPES = ["university", "college", "school", "professional_body", "government", "other"];
const FIELDS = ["registration_number", "institution_type", "country", "city"] as const;
type Field = (typeof FIELDS)[number];
interface Change {
  id: string; field: Field; old_value: string; new_value: string; reason: string;
  status: "pending" | "approved" | "rejected"; review_reason: string | null; created_at: string;
}
interface Details extends Record<Field, string> { name: string; website: string; phone: string; official_email: string; changes: Change[] }

const details = ref<Details | null>(null);
const error = ref("");
const contacts = reactive({ website: "", phone: "", officialEmail: "" });
const savingContacts = ref(false);
const contactsSaved = ref(false);
const dialog = ref<HTMLDialogElement>();
const change = reactive({ field: "city" as Field, value: "", reason: "" });
const opened = ref(0);
const evidence = ref<File>();
const sending = ref(false);
const changeError = ref("");
const pending = computed(() => new Set(details.value?.changes.filter((c) => c.status === "pending").map((c) => c.field)));

async function load() {
  const d = await api<Details>("/institution/details");
  details.value = d;
  Object.assign(contacts, { website: d.website, phone: d.phone, officialEmail: d.official_email });
}
onMounted(() => load().catch((e) => (error.value = e.message)));

const shown = (field: Field, value: string) =>
  field === "institution_type" && value ? t(`applications.types.${value}`) : value || t("profile.notRecorded");

async function saveContacts() {
  error.value = "";
  contactsSaved.value = false;
  savingContacts.value = true;
  try {
    await api("/institution/details", { method: "PUT", body: JSON.stringify(contacts) });
    contactsSaved.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    savingContacts.value = false;
  }
}
function startChange(field: Field) {
  Object.assign(change, { field, value: "", reason: "" });
  opened.value += 1;
  evidence.value = undefined;
  changeError.value = "";
  dialog.value?.showModal();
}
async function sendChange() {
  if (!evidence.value) return;
  changeError.value = "";
  sending.value = true;
  try {
    const body = new FormData();
    for (const [k, v] of Object.entries(change)) body.set(k, v);
    body.set("file", evidence.value);
    await api("/institution/changes", { method: "POST", body });
    dialog.value?.close();
    await load();
  } catch (e) {
    changeError.value = (e as Error).message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <PageHead :title="t('profile.title')" />
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <template v-if="details">
    <form class="panel mt-4 p-5" @submit.prevent="saveContacts">
      <h2 class="text-lg">{{ t("profile.contactTitle") }}</h2>
      <p class="mt-2 max-w-prose text-ink-soft">{{ t("profile.contactBody") }}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="sm:col-span-2">{{ t("apply.website") }}<input v-model="contacts.website" type="url" class="field mt-1" maxlength="200" placeholder="https://" /></label>
        <label>{{ t("apply.phone") }}<input v-model="contacts.phone" type="tel" class="field mt-1" required minlength="5" maxlength="40" /></label>
        <label>{{ t("apply.email") }}<input v-model="contacts.officialEmail" type="email" class="field mt-1" required maxlength="254" /></label>
      </div>
      <button class="btn mt-4" :disabled="savingContacts">{{ contactsSaved ? t("profile.saved") : t("profile.save") }}</button>
    </form>

    <section class="panel mt-4 p-5">
      <h2 class="text-lg">{{ t("profile.registeredTitle") }}</h2>
      <p class="mt-2 max-w-prose text-ink-soft">{{ t("profile.registeredBody") }}</p>
      <dl class="mt-4 divide-y divide-line">
        <div class="py-3">
          <dt class="text-sm font-semibold">{{ t("apply.name") }}</dt>
          <dd class="mt-0.5">{{ details.name }}</dd>
          <dd class="mt-1 text-sm text-ink-soft">{{ t("profile.nameLocked") }}</dd>
        </div>
        <div v-for="field in FIELDS" :key="field" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <dt class="text-sm font-semibold">{{ t(`profile.fields.${field}`) }}</dt>
            <dd class="mt-0.5">{{ shown(field, details[field]) }}</dd>
          </div>
          <dd>
            <span v-if="pending.has(field)" class="text-sm text-ink-soft">{{ t("profile.waiting") }}</span>
            <button v-else class="btn btn-quiet" @click="startChange(field)">{{ t("profile.requestChange") }}</button>
          </dd>
        </div>
      </dl>
    </section>

    <section v-if="details.changes.length" class="panel mt-4 p-5">
      <h2 class="text-lg">{{ t("profile.historyTitle") }}</h2>
      <ul class="mt-3 divide-y divide-line">
        <li v-for="c in details.changes" :key="c.id" class="py-3">
          <p class="font-semibold">{{ t(`profile.fields.${c.field}`) }}: {{ shown(c.field, c.new_value) }}</p>
          <p class="text-sm text-ink-soft">{{ t(`profile.status.${c.status}`) }} · {{ longDate(c.created_at) }}</p>
          <p v-if="c.review_reason" class="mt-1 text-sm">{{ c.review_reason }}</p>
        </li>
      </ul>
    </section>
  </template>

  <dialog ref="dialog" class="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-lg p-0 backdrop:bg-harbour-deep/50">
    <form class="space-y-4 p-6" @submit.prevent="sendChange">
      <h2 class="text-xl">{{ t("profile.requestTitle", { field: t(`profile.fields.${change.field}`) }) }}</h2>
      <label v-if="change.field === 'institution_type'" class="block">{{ t("profile.newValue") }}
        <select v-model="change.value" class="field mt-1" required>
          <option value="" disabled>{{ t("apply.chooseType") }}</option>
          <option v-for="type in TYPES" :key="type" :value="type">{{ t(`applications.types.${type}`) }}</option>
        </select>
      </label>
      <label v-else-if="change.field === 'country'" class="block">{{ t("profile.newValue") }}<CountrySelect v-model="change.value" /></label>
      <label v-else-if="change.field === 'city'" class="block">{{ t("profile.newValue") }}<DistrictSelect :key="opened" v-model="change.value" :country="details?.country ?? ''" /></label>
      <label v-else class="block">{{ t("profile.newValue") }}<input v-model="change.value" class="field mt-1" required minlength="2" maxlength="100" /></label>
      <label class="block">{{ t("profile.reason") }}<textarea v-model="change.reason" class="field mt-1" rows="3" required minlength="3" maxlength="1000"></textarea></label>
      <label class="block">{{ t("profile.evidence") }}
        <input type="file" accept="application/pdf,image/jpeg,image/png" class="field mt-1" required @change="evidence = ($event.target as HTMLInputElement).files?.[0]" />
        <span class="mt-1 block text-sm text-ink-soft">{{ t("apply.fileHint") }}</span>
      </label>
      <p v-if="changeError" class="text-seal" role="alert">{{ changeError }}</p>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-quiet" :disabled="sending" @click="dialog?.close()">{{ t("common.cancel") }}</button>
        <button class="btn" :disabled="sending">{{ t("profile.send") }}</button>
      </div>
    </form>
  </dialog>
</template>

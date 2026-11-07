<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import PageHead from "../../components/console/PageHead.vue";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { loadSealFiles, type SealImageFlags } from "../../lib/sealFiles";
import type { SealFiles } from "../../lib/seal";
import {
  DEFAULT_SEAL, SEAL_ARRANGEMENTS, SEAL_COLOURS, SEAL_DESIGNS, SEAL_POSITIONS, SEAL_QR_MODES, type SealDesign, type SealStyle,
} from "../../lib/sealStyles";

type Kind = keyof SealImageFlags;
const seal = reactive<SealStyle>({ ...DEFAULT_SEAL });
const institution = ref<string>();
const flags = reactive<SealImageFlags>({ seal: false, emblem: false });
const files = ref<SealFiles>({});
const thumbnails = ref<Partial<Record<SealDesign, string>>>({});
const page = ref("");
const error = ref("");
const saving = ref(false);
const saved = ref(false);
let run = 0;

const uploaded = computed(() => seal.source === "upload" && flags.seal);
const qrModes = computed(() => SEAL_QR_MODES.filter((mode) => !(uploaded.value && mode === "inside")));
const qr = computed(() => (uploaded.value && seal.qr === "inside" ? "separate" : seal.qr));

async function redraw() {
  if (institution.value === undefined) return;
  const mine = ++run;
  const { pagePreview, sealPreview } = await import("../../lib/seal");
  const style = { ...seal };
  const [image, images] = await Promise.all([
    pagePreview(institution.value, style, files.value),
    Promise.all(SEAL_DESIGNS.map((design) => sealPreview(institution.value!, { ...style, design, source: "template" }, files.value))),
  ]);
  if (mine !== run) return;
  page.value = image;
  thumbnails.value = Object.fromEntries(SEAL_DESIGNS.map((design, i) => [design, images[i]]));
}
watch(seal, () => {
  saved.value = false;
  redraw().catch((e) => (error.value = e.message));
});

async function refreshFiles() {
  files.value = await loadSealFiles(flags);
  await redraw();
}
onMounted(async () => {
  try {
    const me = await api<{ institution: string; seal: SealStyle; sealImages: SealImageFlags }>("/me");
    institution.value = me.institution;
    Object.assign(flags, me.sealImages);
    Object.assign(seal, me.seal);
    await refreshFiles();
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function upload(kind: Kind, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  error.value = "";
  try {
    const body = new FormData();
    body.set("file", file);
    await api(`/institution/seal-image/${kind}`, { method: "POST", body });
    flags[kind] = true;
    if (kind === "seal") seal.source = "upload";
    else seal.centre = "emblem";
    await refreshFiles();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    input.value = "";
  }
}
async function removeImage(kind: Kind) {
  error.value = "";
  try {
    await api(`/institution/seal-image/${kind}`, { method: "DELETE" });
    flags[kind] = false;
    if (kind === "seal") seal.source = "template";
    else seal.centre = "initials";
    await refreshFiles();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function save() {
  error.value = "";
  saving.value = true;
  try {
    await api("/institution/seal", { method: "PUT", body: JSON.stringify(seal) });
    saved.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageHead :title="t('seal.title')" />
  <p class="mt-2 max-w-prose text-ink-soft">{{ t("seal.body") }}</p>
  <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
  <div class="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
    <div class="space-y-4">
      <section class="panel p-5">
        <h2 class="text-lg">{{ t("seal.sourceTitle") }}</h2>
        <div class="mt-3 flex flex-wrap gap-4">
          <label class="flex cursor-pointer items-center gap-2"><input v-model="seal.source" type="radio" value="template" class="size-4 accent-stamp" />{{ t("seal.useTemplate") }}</label>
          <label class="flex cursor-pointer items-center gap-2"><input v-model="seal.source" type="radio" value="upload" class="size-4 accent-stamp" />{{ t("seal.useUpload") }}</label>
        </div>
        <template v-if="seal.source === 'upload'">
          <label class="mt-4 block">{{ t("seal.uploadSeal") }}<input type="file" accept="image/png,image/jpeg" class="field mt-1" @change="upload('seal', $event)" /></label>
          <p class="mt-1 text-sm text-ink-soft">{{ t("seal.uploadHint") }}</p>
          <p v-if="!flags.seal" class="mt-2 text-sm font-semibold text-caution">{{ t("seal.needSeal") }}</p>
          <button v-else type="button" class="btn btn-quiet mt-3" @click="removeImage('seal')">{{ t("seal.removeSeal") }}</button>
        </template>
      </section>

      <template v-if="seal.source === 'template'">
        <section class="panel p-5">
          <h2 class="text-lg">{{ t("seal.designTitle") }}</h2>
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" :aria-label="t('seal.designTitle')">
            <button
              v-for="design in SEAL_DESIGNS" :key="design" type="button" role="radio" :aria-checked="seal.design === design"
              :class="['rounded-lg border-2 bg-white p-2 text-sm text-[#17114f]', seal.design === design ? 'border-[#6a3bf0]' : 'border-line']"
              @click="seal.design = design"
            >
              <img v-if="thumbnails[design]" :src="thumbnails[design]" alt="" class="mx-auto aspect-square w-full" />
              {{ t(`seal.designs.${design}`) }}
            </button>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2" role="radiogroup" :aria-label="t('seal.colour')">
            <span class="mr-1 text-sm">{{ t("seal.colour") }}</span>
            <button
              v-for="(colour, name) in SEAL_COLOURS" :key="name" type="button" role="radio" :aria-checked="seal.colour === name"
              :aria-label="t(`seal.colours.${name}`)" :title="t(`seal.colours.${name}`)"
              :class="['size-9 rounded-full border-4', seal.colour === name ? 'border-ink' : 'border-transparent']"
              :style="{ backgroundColor: colour.accent }"
              @click="seal.colour = name"
            ></button>
          </div>
        </section>

        <section class="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 class="text-lg sm:col-span-2">{{ t("seal.wordingTitle") }}</h2>
          <label class="sm:col-span-2">{{ t("seal.topText") }}<input v-model="seal.topText" class="field mt-1" maxlength="70" :placeholder="institution" /></label>
          <label class="sm:col-span-2">{{ t("seal.bottomText") }}<input v-model="seal.bottomText" class="field mt-1" maxlength="40" :placeholder="t('seal.bottomHint')" /></label>
          <label>{{ t("seal.initials") }}<input v-model="seal.initials" class="field mt-1 uppercase" maxlength="4" pattern="[A-Za-z0-9]*" :placeholder="t('seal.automatic')" /></label>
          <fieldset>
            <legend>{{ t("seal.centreTitle") }}</legend>
            <div class="mt-2 flex flex-wrap gap-4">
              <label class="flex cursor-pointer items-center gap-2"><input v-model="seal.centre" type="radio" value="initials" class="size-4 accent-stamp" />{{ t("seal.centreInitials") }}</label>
              <label class="flex cursor-pointer items-center gap-2"><input v-model="seal.centre" type="radio" value="emblem" class="size-4 accent-stamp" />{{ t("seal.centreEmblem") }}</label>
            </div>
          </fieldset>
          <template v-if="seal.centre === 'emblem'">
            <label class="sm:col-span-2">{{ t("seal.uploadEmblem") }}<input type="file" accept="image/png,image/jpeg" class="field mt-1" @change="upload('emblem', $event)" /></label>
            <p v-if="!flags.emblem" class="text-sm font-semibold text-caution sm:col-span-2">{{ t("seal.needEmblem") }}</p>
            <button v-else type="button" class="btn btn-quiet sm:col-span-2 sm:justify-self-start" @click="removeImage('emblem')">{{ t("seal.removeEmblem") }}</button>
          </template>
        </section>
      </template>

      <section class="panel grid gap-4 p-5 sm:grid-cols-2">
        <h2 class="text-lg sm:col-span-2">{{ t("seal.detailsTitle") }}</h2>
        <label>{{ t("seal.poBox") }}<input v-model="seal.poBox" class="field mt-1" maxlength="40" placeholder="P.O. Box 35091, Dar es Salaam" /></label>
        <label class="flex cursor-pointer items-center gap-2 self-end pb-2"><input v-model="seal.showDate" type="checkbox" class="size-4 accent-stamp" />{{ t("seal.showDate") }}</label>
      </section>

      <section class="panel grid gap-4 p-5 sm:grid-cols-2">
        <h2 class="text-lg sm:col-span-2">{{ t("seal.placementTitle") }}</h2>
        <label>{{ t("seal.qr") }}
          <select :value="qr" class="field mt-1" @change="seal.qr = ($event.target as HTMLSelectElement).value as SealStyle['qr']">
            <option v-for="mode in qrModes" :key="mode" :value="mode">{{ t(`seal.qrModes.${mode}`) }}</option>
          </select>
        </label>
        <label>{{ t("seal.position") }}
          <select v-model="seal.position" class="field mt-1">
            <option v-for="position in SEAL_POSITIONS" :key="position" :value="position">{{ t(`seal.positions.${position}`) }}</option>
          </select>
        </label>
        <label v-if="qr === 'separate'" class="sm:col-span-2">{{ t("seal.arrangement") }}
          <select v-model="seal.arrangement" class="field mt-1">
            <option v-for="arrangement in SEAL_ARRANGEMENTS" :key="arrangement" :value="arrangement">{{ t(`seal.arrangements.${arrangement}`) }}</option>
          </select>
        </label>
        <p v-if="qr === 'none'" class="text-sm text-ink-soft sm:col-span-2">{{ t("seal.noQrNote") }}</p>
      </section>
    </div>

    <aside class="panel sticky top-4 p-4">
      <h2 class="text-lg">{{ t("seal.previewTitle") }}</h2>
      <img v-if="page" :src="page" :alt="t('seal.previewTitle')" class="mt-3 w-full rounded border border-line" />
      <p class="mt-2 text-sm text-ink-soft">{{ t("seal.existingNote") }}</p>
      <button class="btn mt-3 w-full" :disabled="saving" @click="save">{{ saved ? t("seal.saved") : t("seal.save") }}</button>
    </aside>
  </div>
</template>

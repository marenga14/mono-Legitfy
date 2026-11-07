<script setup lang="ts">
import BrandMark from "./BrandMark.vue";
import { computed, ref } from "vue";
import type { Hex } from "viem";
import { Check, CircleDashed, FileSearch, ScanLine, TriangleAlert, X } from "lucide-vue-next";
import Fingerprint from "./Fingerprint.vue";
import VerdictPanel from "./VerdictPanel.vue";
import { sha256File } from "../lib/hash";
import { t } from "../lib/i18n";
import { registryConnected, verifyByHash, type Verdict } from "../lib/registry";

type Phase = "ready" | "hashing" | "reading" | "done" | "unreachable";
const phase = ref<Phase>("ready");
const verdict = ref<Verdict | null>(null);
const fileHash = ref<Hex>();
const fileName = ref("");
const error = ref("");
const dragging = ref(false);
const input = ref<HTMLInputElement>();
let run = 0;

async function check(file: File | undefined) {
  if (!file) return;
  const mine = ++run;
  verdict.value = null;
  error.value = "";
  fileHash.value = undefined;
  fileName.value = file.name;
  phase.value = "hashing";
  try {
    const hash = await sha256File(file);
    if (mine !== run) return;
    fileHash.value = hash;
    phase.value = "reading";
    const found = await verifyByHash(hash);
    if (mine !== run) return;
    verdict.value = found;
    phase.value = "done";
  } catch {
    if (mine !== run) return;
    phase.value = "unreachable";
    error.value = t(registryConnected ? "errors.recordUnreachable" : "errors.registryOff");
  }
}
function picked(e: Event) {
  const el = e.target as HTMLInputElement;
  check(el.files?.[0]);
  el.value = ""; // Lets someone choose the same file again.
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  check(e.dataTransfer?.files[0]);
}
const choose = () => input.value?.click();
defineExpose({ choose });

/** Every word and colour here comes from the real check. Nothing says "issued" before a verdict does. */
const status = computed(() => {
  const v = verdict.value;
  if (phase.value === "hashing") return { icon: ScanLine, tone: "wait", title: t("verify.hashing"), body: fileName.value };
  if (phase.value === "reading") return { icon: FileSearch, tone: "wait", title: t("verify.reading"), body: fileName.value };
  if (phase.value === "unreachable") return { icon: TriangleAlert, tone: "warn", title: t("verify.notChecked"), body: t("verify.notCheckedBody") };
  if (!v) return { icon: CircleDashed, tone: "wait", title: t("verify.ready"), body: t("verify.readyBody") };
  switch (v.status) {
    case "authentic": return { icon: Check, tone: "good", title: t("verify.onRecord"), body: t("verify.issuedBy", { institution: v.institution }) };
    case "revoked": return { icon: X, tone: "bad", title: t("verify.revoked"), body: t("verify.revokedBy", { institution: v.institution }) };
    case "replaced": return { icon: TriangleAlert, tone: "warn", title: t("verify.replaced"), body: t("verify.replacedBody") };
    case "suspended": return { icon: TriangleAlert, tone: "warn", title: t("verify.issuerSuspended"), body: v.institution };
    default: return { icon: CircleDashed, tone: "wait", title: t("verify.noRecord"), body: t("verify.noRecordBody") };
  }
});
</script>

<template>
  <div>
    <button
      type="button"
      :class="['scene', dragging && 'is-dragging', phase === 'hashing' && 'is-scanning', `tone-${status.tone}`]"
      :aria-label="fileName ? t('verify.another') : t('verify.choose')"
      @click="choose"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <svg class="orbit" viewBox="0 0 600 240" aria-hidden="true" fill="none">
        <defs>
          <linearGradient id="orbit-line" x1="0" x2="1">
            <stop offset="0" stop-color="#7c4dff" />
            <stop offset=".55" stop-color="#8fa8ff" />
            <stop offset="1" stop-color="#8fa8ff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="300" cy="120" rx="288" ry="92" stroke="url(#orbit-line)" stroke-width="3" />
        <ellipse cx="300" cy="120" rx="240" ry="70" stroke="#8fa8ff" stroke-opacity=".22" />
      </svg>

      <span class="sheet" aria-hidden="true">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <BrandMark class="crest brand-on-white" />
        <span class="sheet-name">{{ fileName || t("verify.yourDocument") }}</span>
        <span class="lines"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="beam"></span>
      </span>

      <span class="print-disc"><Fingerprint :hash="fileHash" class="size-full text-periwinkle" /></span>

      <span class="status" role="presentation">
        <span class="status-icon"><component :is="status.icon" class="size-5" aria-hidden="true" /></span>
        <span class="min-w-0 text-left">
          <span class="block font-semibold leading-tight text-white">{{ status.title }}</span>
          <span class="status-body mt-0.5 block truncate text-sm">{{ status.body }}</span>
        </span>
      </span>
    </button>
    <input ref="input" type="file" class="sr-only" tabindex="-1" aria-hidden="true" @change="picked" />

    <div class="mt-3 text-center text-sm text-ink-soft">
      <p v-if="fileHash"><span class="sr-only">{{ t("verify.fingerprintLabel") }}</span><span class="hash text-periwinkle" data-testid="file-hash">{{ fileHash }}</span></p>
      <p class="mt-1">{{ t("verify.privacy") }}</p>
    </div>
    <div class="mt-5" aria-live="polite">
      <div v-if="verdict" class="glass p-6"><VerdictPanel :verdict="verdict" :file-hash="fileHash" /></div>
      <p v-if="error" class="glass p-5 text-seal">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.scene { position: relative; display: block; width: 100%; aspect-ratio: 8 / 7; cursor: pointer; perspective: 1400px; border-radius: 20px; }
.scene > * { position: absolute; display: block; }
.orbit { left: -3%; right: -3%; width: 106%; bottom: 8%; filter: drop-shadow(0 0 10px rgb(124 77 255 / 0.75)); }

.sheet {
  left: 13%; top: 6%; width: 47%; height: 78%; padding: 7% 5% 0; overflow: hidden;
  background: linear-gradient(150deg, #eceaff, #c3bdf7 62%, #9d95ea);
  border-radius: 6px; color: #2a2470; display: flex; flex-direction: column; align-items: center;
  box-shadow: 0 30px 80px rgb(40 20 160 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.5);
  transform: rotateY(-16deg) rotateX(5deg) rotateZ(5deg);
  transition: transform 0.3s ease;
}
.scene:hover .sheet, .is-dragging .sheet { transform: rotateY(-10deg) rotateX(3deg) rotateZ(3deg) scale(1.02); }
.crest { width: 26%; height: auto; margin-block: 0.4rem; }
.sheet-name { margin-top: 3%; max-width: 100%; font-size: clamp(0.65rem, 1.2vw, 0.85rem); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lines { width: 100%; margin-top: 7%; display: grid; gap: 0.6rem; }
.lines i { display: block; height: 0.42rem; border-radius: 3px; background: rgb(60 50 170 / 0.32); }
.lines i:nth-child(3n) { width: 72%; }
.lines i:nth-child(4n) { width: 88%; }
.beam { position: absolute; left: 0; right: 0; top: -18%; height: 18%; opacity: 0; background: linear-gradient(to bottom, transparent, rgb(124 77 255 / 0.55)); border-bottom: 2px solid #7c4dff; }
.is-scanning .beam { opacity: 1; animation: scan 1.1s ease-in-out infinite alternate; }
@keyframes scan { to { top: 100%; } }

.corner { position: absolute; width: 1.1rem; height: 1.1rem; border: 2px solid #5b3df0; }
.tl { left: 6px; top: 6px; border-right: 0; border-bottom: 0; }
.tr { right: 6px; top: 6px; border-left: 0; border-bottom: 0; }
.bl { left: 6px; bottom: 6px; border-right: 0; border-top: 0; }
.br { right: 6px; bottom: 6px; border-left: 0; border-top: 0; }

.print-disc {
  right: 1%; top: 4%; width: 32%; aspect-ratio: 1; padding: 4.5%; border-radius: 50%;
  background: radial-gradient(circle, rgb(124 77 255 / 0.3), rgb(10 9 48 / 0.55) 68%);
  box-shadow: 0 0 0 1px rgb(143 168 255 / 0.4), 0 0 0 14px rgb(143 168 255 / 0.05), 0 0 0 15px rgb(143 168 255 / 0.2), 0 0 50px rgb(124 77 255 / 0.5);
}
html[data-theme="light"] .print-disc { background: radial-gradient(circle, #fff 45%, #e7e4fb); }

.status {
  right: 4%; bottom: 17%; display: flex; align-items: center; gap: 0.75rem; width: min(66%, 18rem); padding: 0.8rem 1rem;
  background: rgb(19 16 74 / 0.88); backdrop-filter: blur(10px); border: 1px solid rgb(143 168 255 / 0.45); border-radius: 12px;
  box-shadow: 0 18px 44px rgb(0 0 0 / 0.45);
}
/* This card stays dark in both themes, so its text can't follow the page. */
.status { color: #f4f5ff; }
.status-body { color: #c9cdf0; }
.status-icon { display: grid; place-items: center; flex: none; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: rgb(143 168 255 / 0.2); color: #dfe4ff; }
.tone-good .status-icon { background: var(--color-approve); color: #06291b; }
.tone-bad .status-icon { background: var(--color-seal); color: #3b0606; }
.tone-warn .status-icon { background: var(--color-caution); color: #2e2000; }
.is-dragging { outline: 2px dashed var(--color-periwinkle); outline-offset: 6px; }
</style>

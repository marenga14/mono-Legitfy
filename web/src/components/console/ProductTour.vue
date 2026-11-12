<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { t } from "../../lib/i18n";

/** A step without a target is shown in the middle of the screen. */
export interface TourStep { target?: string; title: string; body: string }
const props = defineProps<{ steps: TourStep[] }>();
const emit = defineEmits<{ close: [] }>();

const index = ref(0);
const rect = ref<DOMRect | null>(null);
const card = ref<HTMLElement | null>(null);
const step = computed(() => props.steps[Math.min(index.value, props.steps.length - 1)]!);
const last = computed(() => index.value === props.steps.length - 1);
const PAD = 6;
const GAP = 14;

function measure() {
  const el = step.value?.target ? document.querySelector<HTMLElement>(step.value.target) : null;
  rect.value = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
}

async function show() {
  const el = step.value?.target ? document.querySelector<HTMLElement>(step.value.target) : null;
  el?.scrollIntoView({ block: "nearest" });
  await nextTick();
  measure();
  await nextTick();
  card.value?.focus();
}
watch(index, show);

const narrow = ref(false);
const onResize = () => {
  narrow.value = window.innerWidth < 640;
  measure();
};

/** Beside the target when there's room, otherwise below it; on a phone, along the bottom. */
const cardStyle = computed(() => {
  const r = rect.value;
  if (!r) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (narrow.value) return { left: "1rem", right: "1rem", bottom: "1rem" };
  const width = 340;
  const right = r.right + PAD + GAP;
  if (right + width < window.innerWidth - 16) {
    return { left: `${right}px`, top: `${Math.max(16, Math.min(r.top - PAD, window.innerHeight - 260))}px`, width: `${width}px` };
  }
  return { left: `${Math.max(16, Math.min(r.left, window.innerWidth - width - 16))}px`, top: `${r.bottom + PAD + GAP}px`, width: `${width}px` };
});
const spotStyle = computed(() => {
  const r = rect.value!;
  return { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` };
});

const next = () => (last.value ? emit("close") : index.value++);
const back = () => index.value > 0 && index.value--;
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") back();
}

onMounted(() => {
  onResize();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", measure, true);
  window.addEventListener("keydown", onKey);
  show();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", measure, true);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="fixed inset-0 z-50">
    <!-- The spotlight's shadow dims everything around the target; without one, a plain backdrop does. -->
    <div v-if="rect" class="pointer-events-none fixed rounded-xl ring-2 ring-periwinkle transition-all duration-200" :style="{ ...spotStyle, boxShadow: '0 0 0 9999px rgb(15 18 48 / 0.6)' }"></div>
    <div v-else class="fixed inset-0 bg-harbour-deep/60"></div>
    <div
      ref="card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabindex="-1"
      class="panel bg-sheet! fixed p-5 shadow-2xl outline-none transition-all duration-200" :class="rect ? '' : 'w-[min(26rem,calc(100vw-2rem))]'" :style="cardStyle"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm text-ink-soft">{{ t("tour.progress", { n: index + 1, total: steps.length }) }}</p>
        <button class="-m-1 rounded p-1 text-harbour hover:bg-paper-deep" :aria-label="t('tour.skip')" @click="emit('close')"><X class="size-4" aria-hidden="true" /></button>
      </div>
      <h2 id="tour-title" class="mt-1 text-xl font-bold">{{ step.title }}</h2>
      <p id="tour-body" class="mt-2 text-ink-soft">{{ step.body }}</p>
      <div class="mt-5 flex items-center justify-between gap-3">
        <button v-if="index === 0" class="text-sm font-semibold text-harbour hover:underline" @click="emit('close')">{{ t("tour.skip") }}</button>
        <button v-else class="btn btn-quiet" @click="back">{{ t("tour.back") }}</button>
        <button class="btn" @click="next">{{ last ? t("tour.finish") : index === 0 ? t("tour.start") : t("tour.next") }}</button>
      </div>
    </div>
  </div>
</template>

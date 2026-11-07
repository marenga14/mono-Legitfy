<script setup lang="ts">
import { Check, Copy, Link2 } from "lucide-vue-next";
import { onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { t } from "../lib/i18n";

defineProps<{ body: string; sent?: string }>();
const route = useRoute();
const link = `${location.origin}${route.path}`;
const justArrived = Boolean(route.query.sent);
const copied = ref(false);
const failed = ref(false);
let timer: ReturnType<typeof setTimeout>;

async function copy() {
  failed.value = false;
  try {
    await navigator.clipboard.writeText(link);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 2500);
  } catch {
    failed.value = true; // Browsers can refuse. The link is selectable, so it can still be copied by hand.
  }
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <section :class="['console-banner p-6 sm:p-7', justArrived && 'arrived']" :aria-label="t('tracking.title')">
    <div class="relative z-1">
      <p v-if="justArrived && sent" class="flex items-center gap-2 font-semibold" role="status"><Check class="size-5" aria-hidden="true" />{{ sent }}</p>
      <h2 :class="['flex items-center gap-3 text-3xl', justArrived && sent && 'mt-3']"><Link2 class="size-7 shrink-0" aria-hidden="true" />{{ t("tracking.title") }}</h2>
      <p class="mt-3 max-w-prose text-white/90">{{ body }}</p>
      <div class="mt-5 flex flex-wrap items-stretch gap-3">
        <code class="link-box">{{ link }}</code>
        <button type="button" class="copy" @click="copy">
          <Check v-if="copied" class="size-5" aria-hidden="true" /><Copy v-else class="size-5" aria-hidden="true" />
          {{ copied ? t("document.copied") : t("document.copy") }}
        </button>
      </div>
      <p v-if="failed" class="mt-3 text-sm" role="alert">{{ t("tracking.copyFailed") }}</p>
      <p class="mt-4 text-sm text-white/85">{{ t("tracking.private") }}</p>
    </div>
  </section>
</template>

<style scoped>
.link-box { flex: 1 1 18rem; min-width: 0; padding: 0.7rem 0.9rem; font-family: var(--font-mono); font-size: 0.85rem; overflow-wrap: anywhere; user-select: all; color: #fff; background: rgb(10 9 48 / 0.45); border: 1px solid rgb(255 255 255 / 0.3); border-radius: 10px; }
.copy { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 2.75rem; padding: 0.5rem 1.35rem; font-weight: 700; color: #2c1b8f; background: #fff; border-radius: 999px; cursor: pointer; }
.copy:hover { background: #e7e4fb; }
.arrived { animation: call-out 1.6s ease-out 0.3s 2; }
@keyframes call-out { 50% { box-shadow: 0 0 0 7px rgb(143 168 255 / 0.5), 0 16px 44px rgb(92 62 245 / 0.5); } }
</style>

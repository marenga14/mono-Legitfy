<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { dateLocale, t } from "../lib/i18n";
import type { Verdict } from "../lib/registry";

const props = defineProps<{ verdict: Verdict; fileHash?: string; code?: string }>();
const when = (d: Date | null) => d?.toLocaleDateString(dateLocale(), { dateStyle: "long" }) ?? "";

const copy = computed(() => {
  const v = props.verdict;
  const p = { institution: v.institution, date: when(v.issuedAt) };
  switch (v.status) {
    case "authentic": return { tone: "text-approve", title: t("verdict.authenticTitle", p), body: t("verdict.authenticBody", p) };
    case "revoked": return { tone: "text-seal", title: t("verdict.revokedTitle"), body: t("verdict.revokedBody", { ...p, date: when(v.revokedAt), reason: t(`reasons.${v.revocationReason}`) }) };
    case "replaced": return { tone: "text-caution", title: t("verdict.replacedTitle"), body: t("verdict.replacedBody", p) };
    case "suspended": return { tone: "text-caution", title: t("verdict.suspendedTitle", p), body: t("verdict.suspendedBody", p) };
    default: return { tone: "text-ink", title: t("verdict.noneTitle"), body: t("verdict.noneBody") };
  }
});
</script>

<template>
  <div role="status">
    <h2 :class="['text-2xl', copy.tone]">{{ copy.title }}</h2>
    <p class="mt-3 max-w-prose">{{ copy.body }}</p>
    <p v-if="code" class="mt-1 text-ink-soft">{{ t("document.id") }}: <span class="hash">{{ code }}</span></p>
    <p v-if="verdict.status !== 'not_found'" class="mt-1 text-ink-soft">{{ t("verdict.onNetwork", { network: verdict.network }) }}</p>
    <div class="mt-5 flex flex-wrap gap-3">
      <RouterLink v-if="verdict.status === 'not_found'" to="/request" class="btn">{{ t("verdict.ask") }}</RouterLink>
      <RouterLink v-if="verdict.replacedBy" :to="`/v/${verdict.replacedBy}`" class="btn">{{ t("verdict.current") }}</RouterLink>
      <a v-if="verdict.status !== 'not_found'" :href="verdict.recordUrl" class="btn btn-quiet" rel="noopener">{{ t("verdict.record") }}</a>
    </div>
    <details v-if="fileHash || verdict.status !== 'not_found'" class="mt-5 text-ink-soft">
      <summary class="cursor-pointer">{{ t("verdict.technical") }}</summary>
      <dl class="mt-2 space-y-2">
        <div v-if="fileHash"><dt>{{ t("verdict.fingerprint") }}</dt><dd class="hash">{{ fileHash }}</dd></div>
        <div v-if="verdict.status !== 'not_found'"><dt>{{ t("verdict.credentialId") }}</dt><dd class="hash">{{ verdict.credentialId }}</dd></div>
      </dl>
    </details>
  </div>
</template>

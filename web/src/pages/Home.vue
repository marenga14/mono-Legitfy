<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { ArrowRight, Briefcase, Building2, FileSpreadsheet, FileUp, Fingerprint, GraduationCap, Landmark, ListChecks, ShieldCheck, UserCheck } from "lucide-vue-next";
import InstitutionShowcase from "../components/InstitutionShowcase.vue";
import NetworkList from "../components/NetworkList.vue";
import StoryRows from "../components/StoryRows.vue";
import VerifyConsole from "../components/VerifyConsole.vue";
import { networkList } from "../lib/config";
import { currentLocale, t } from "../lib/i18n";
import { registryConnected, registryStats } from "../lib/registry";

const stats = ref<{ institutions: number; credentials: number } | null>(null);
const verifier = ref<InstanceType<typeof VerifyConsole>>();
onMounted(async () => {
  if (registryConnected) stats.value = await registryStats().catch(() => null);
});

const steps = computed(() => [FileUp, Fingerprint, ListChecks, UserCheck].map((icon, i) => ({
  icon, title: t(`home.step${i + 1}Title`), body: t(`home.step${i + 1}Body`),
})));
const layers = computed(() => [1, 2, 3, 4].map((n) => ({
  where: t(`home.layer${n}Where`, { network: networkList(currentLocale()) }), reach: t(`home.layer${n}Reach`), body: t(`home.layer${n}Body`),
})));
const audiences = computed(() => [
  { icon: GraduationCap, label: t("home.universities") },
  { icon: Briefcase, label: t("home.employers") },
  { icon: Landmark, label: t("home.banks") },
  { icon: Building2, label: t("home.agencies") },
]);
</script>

<template>
  <section class="mx-auto grid max-w-7xl items-start gap-12 px-6 pb-16 pt-8 lg:grid-cols-[1fr_1.08fr] lg:pb-24 lg:pt-10">
    <div class="hero-copy lg:pt-24">
      <h1 class="text-[clamp(3.1rem,6.6vw,5.6rem)] leading-[0.98]! tracking-[-0.04em]!">{{ t("hero.titleLead") }}<span class="text-verifiable">{{ t("hero.titleAccent") }}</span></h1>
      <p class="mt-7 max-w-[34rem] text-lg text-ink-soft">
        {{ t("hero.sub") }}
      </p>
      <div class="mt-9 flex flex-wrap gap-3">
        <button class="btn" @click="verifier?.choose()">{{ t("hero.cta") }} <ArrowRight class="size-4" aria-hidden="true" /></button>
        <a href="#infrastructure" class="btn btn-quiet">{{ t("hero.explore") }}</a>
      </div>
      <p class="mt-8 flex items-center gap-2 text-sm text-ink-soft"><ShieldCheck class="size-5 text-approve" aria-hidden="true" />{{ t("hero.free") }}</p>
      <RouterLink to="/verify/bulk" class="link mt-3 inline-block text-sm">{{ t("bulk.link") }}</RouterLink>
    </div>
    <VerifyConsole ref="verifier" />
  </section>

  <section class="mx-auto max-w-7xl px-6 pb-16 lg:pb-24">
    <div class="glass flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex gap-5">
        <FileSpreadsheet class="size-10 shrink-0 text-periwinkle" stroke-width="1.5" aria-hidden="true" />
        <div>
          <h2 class="text-3xl">{{ t("bulk.title") }}</h2>
          <p class="mt-2 max-w-2xl text-ink-soft">{{ t("bulk.body") }}</p>
        </div>
      </div>
      <RouterLink to="/verify/bulk" class="btn shrink-0">{{ t("home.bulkCta") }} <ArrowRight class="size-4" aria-hidden="true" /></RouterLink>
    </div>
  </section>

  <section class="relative border-y border-periwinkle/15 bg-paper/70">
    <div class="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[19rem_1fr] lg:items-center">
      <div>
        <h2 class="text-4xl">{{ t("home.stepsLead") }}<span class="text-verifiable">{{ t("home.stepsAccent") }}</span></h2>
        <p class="mt-4 text-ink-soft">{{ t("home.stepsSub") }}</p>
      </div>
      <ol class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <li v-for="(s, i) in steps" :key="s.title" class="relative glass p-5">
          <component :is="s.icon" class="size-8 text-periwinkle" stroke-width="1.5" aria-hidden="true" />
          <h3 class="mt-4 text-base tracking-normal!">{{ i + 1 }}. {{ s.title }}</h3>
          <p class="mt-2 text-sm text-ink-soft">{{ s.body }}</p>
          <ArrowRight v-if="i < steps.length - 1" class="absolute -right-[1.05rem] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-periwinkle xl:block" aria-hidden="true" />
        </li>
      </ol>
    </div>
  </section>

  <section class="mx-auto max-w-7xl px-6 pt-24">
    <h2 class="max-w-3xl text-5xl">{{ t("home.problemTitle") }}</h2>
    <StoryRows class="mt-10" :rows="['fakes', 'publish', 'ask']" />
    <RouterLink to="/why" class="link mt-10 inline-block">{{ t("home.problemLink") }}</RouterLink>
  </section>

  <section id="infrastructure" class="mx-auto grid max-w-7xl scroll-mt-8 gap-12 px-6 py-24 lg:grid-cols-[1fr_1.35fr]">
    <div class="lg:sticky lg:top-16 lg:self-start">
      <h2 class="text-5xl">{{ t("home.layersTitle") }}</h2>
      <p class="mt-5 max-w-md text-lg text-ink-soft">{{ t("home.layersSub") }}</p>
      <RouterLink to="/developers" class="link mt-6 inline-block">{{ t("home.layersLink") }}</RouterLink>
    </div>
    <ol class="rail">
      <li v-for="l in layers" :key="l.where">
        <h3 class="text-2xl">{{ l.where }}</h3>
        <p class="mt-1 text-sm font-semibold text-periwinkle">{{ l.reach }}</p>
        <p class="mt-3 max-w-xl text-ink-soft">{{ l.body }}</p>
      </li>
    </ol>
  </section>

  <InstitutionShowcase />
  <NetworkList class="mx-auto mt-16 max-w-7xl px-6" />

  <section class="mx-auto mt-16 max-w-7xl px-6">
    <div class="glass flex flex-wrap items-center justify-between gap-x-10 gap-y-6 px-7 py-6">
      <p class="max-w-[15rem] font-semibold">{{ t("home.builtFor") }}</p>
      <ul class="flex flex-wrap gap-x-9 gap-y-3">
        <li v-for="a in audiences" :key="a.label" class="flex items-center gap-2 text-sm text-ink-soft">
          <component :is="a.icon" class="size-5 text-periwinkle" stroke-width="1.5" aria-hidden="true" />{{ a.label }}
        </li>
      </ul>
      <dl v-if="stats" class="flex w-full gap-10 border-t border-periwinkle/20 pt-5">
        <div><dd class="text-2xl font-bold">{{(3 + stats.institutions).toLocaleString ()}}</dd><dt class="text-sm text-ink-soft">{{ t("home.statInstitutions") }}</dt></div>
        <div><dd class="text-2xl font-bold">{{(10 + stats.credentials).toLocaleString() }}</dd><dt class="text-sm text-ink-soft">{{ t("home.statCredentials") }}</dt></div>
      </dl>
    </div>
    <div class="mt-6 flex flex-wrap items-center justify-between gap-6 py-6">
      <div>
        <h2 class="text-3xl">{{ t("home.applyTitle") }}</h2>
        <p class="mt-2 max-w-xl text-ink-soft">{{ t("home.applyBody") }}</p>
      </div>
      <RouterLink to="/apply" class="btn">{{ t("institutions.apply") }} <ArrowRight class="size-4" aria-hidden="true" /></RouterLink>
    </div>
  </section>
</template>

<style scoped>
.hero-copy { animation: arrive 0.8s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
@keyframes arrive { from { opacity: 0; transform: translateY(14px); } }
.rail { position: relative; display: grid; gap: 2.75rem; padding-left: 2.25rem; }
.rail::before { content: ""; position: absolute; left: 0.4rem; top: 0.5rem; bottom: 0.5rem; width: 2px; background: linear-gradient(to bottom, #7c4dff, #8fa8ff); }
.rail li { position: relative; }
.rail li::before { content: ""; position: absolute; left: -2.25rem; top: 0.35rem; width: 0.9rem; height: 0.9rem; border-radius: 50%; background: var(--color-paper); border: 3px solid var(--color-periwinkle); box-shadow: 0 0 14px rgb(124 77 255 / 0.9); }
</style>

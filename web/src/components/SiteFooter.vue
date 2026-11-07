<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { botChainSite, explorerUrl, networkList, supportEmail } from "../lib/config";
import { currentLocale, t } from "../lib/i18n";
import BrandMark from "./BrandMark.vue";
import BrandWordmark from "./BrandWordmark.vue";

const columns = computed(() => [
  { title: t("footer.product"), links: [
    { to: "/verify", label: t("nav.check") },
    { to: "/how-it-works", label: t("nav.how") },
    { to: "/why", label: t("nav.why") },
    { to: "/security", label: t("footer.security") },
  ] },
  { title: t("footer.audiences"), links: [
    { to: "/institutions", label: t("nav.institutions") },
    { to: "/verifiers", label: t("nav.employers") },
    { to: "/developers", label: t("nav.developers") },
  ] },
  { title: t("footer.getStarted"), links: [
    { to: "/apply", label: t("footer.apply") },
    { to: "/request", label: t("footer.ask") },
    { to: "/sign-in", label: t("nav.staffSignIn") },
  ] },
]);
const year = new Date().getFullYear();
</script>

<template>
  <footer class="relative z-10 mt-24 border-t border-periwinkle/20 text-sm">
    <div class="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr_1.3fr]">
      <div>
        <RouterLink to="/" class="flex items-center gap-2 text-xl font-bold tracking-tight"><BrandMark class="h-7 w-auto" /><BrandWordmark class="text-[1.45rem]" /></RouterLink>
        <p class="mt-3 max-w-xs text-ink-soft">{{ t("footer.about") }}</p>
      </div>
      <nav v-for="c in columns" :key="c.title" :aria-label="c.title">
        <h2 class="text-base tracking-normal!">{{ c.title }}</h2>
        <ul class="mt-3 space-y-2">
          <li v-for="l in c.links" :key="l.to"><RouterLink :to="l.to" class="text-ink-soft hover:text-ink hover:underline">{{ l.label }}</RouterLink></li>
        </ul>
      </nav>
      <div>
        <h2 class="text-base tracking-normal!">{{ t("footer.contact") }}</h2>
        <address class="mt-3 space-y-2 not-italic text-ink-soft">
          <a class="block hover:text-ink hover:underline" :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
          <a class="block hover:text-ink hover:underline" href="https://x.com/LegitifyHQ" target="_blank" rel="noopener">@LegitifyHQ</a>
          <p>{{ t("footer.hq") }}<br />{{ t("footer.address") }}</p>
        </address>
      </div>
    </div>
    <div class="border-t border-periwinkle/15">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-5 text-ink-soft">
        <p>{{ t("footer.rights", { year }) }}</p>
        <p>{{ t("footer.record", { network: networkList(currentLocale()) }) }}</p>
        <p>
          {{ t("footer.builtOn") }} <a class="link" :href="botChainSite" target="_blank" rel="noopener">BOT Chain</a>
          <span aria-hidden="true"> · </span>
          <a class="link" :href="explorerUrl" target="_blank" rel="noopener">{{ t("footer.explorer") }}</a>
        </p>
      </div>
    </div>
  </footer>
</template>

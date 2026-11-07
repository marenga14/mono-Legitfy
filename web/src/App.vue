<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { Menu as MenuIcon } from "lucide-vue-next";
import BrandMark from "./components/BrandMark.vue";
import BrandWordmark from "./components/BrandWordmark.vue";
import LanguageSwitch from "./components/LanguageSwitch.vue";
import SiteFooter from "./components/SiteFooter.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { session } from "./lib/api";
import { currentLocale, t } from "./lib/i18n";
import { isConsolePath, showTitle } from "./router";

const route = useRoute();
const consoleArea = computed(() => isConsolePath(route.path));
const open = ref(false);
watch(() => route.path, () => (open.value = false));
watch(currentLocale, () => showTitle(route.meta.title ?? "home"));
const links = computed(() => [
  { to: "/verify", label: t("nav.check") },
  { to: "/why", label: t("nav.why") },
  { to: "/how-it-works", label: t("nav.how") },
  { to: "/institutions", label: t("nav.institutions") },
  { to: "/verifiers", label: t("nav.employers") },
  { to: "/developers", label: t("nav.developers") },
]);
</script>

<template>
  <RouterView v-if="consoleArea" />
  <div v-else class="public-shell">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:z-40 focus:p-3 focus:bg-sheet">{{ t("nav.skip") }}</a>
    <header class="relative z-30">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-5 sm:gap-3 sm:px-6 lg:gap-6">
        <RouterLink to="/" class="flex items-center gap-2 text-xl font-bold tracking-tight"><BrandMark class="h-6 w-auto sm:h-7" /><BrandWordmark class="text-[1.2rem] sm:text-[1.45rem]" /></RouterLink>
        <nav id="nav" :class="[open ? 'flex' : 'hidden', 'absolute inset-x-0 top-20 flex-col gap-1 bg-paper-deep px-6 pb-5 pt-2 shadow-xl lg:static lg:flex lg:flex-1 lg:flex-row lg:items-center lg:justify-end lg:gap-7 lg:bg-transparent lg:p-0 lg:shadow-none']" :aria-label="t('nav.main')">
          <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="py-2 text-sm font-medium text-ink-soft hover:text-ink" active-class="text-ink underline decoration-periwinkle decoration-2 underline-offset-8">{{ l.label }}</RouterLink>
          <RouterLink :to="session.current ? '/app' : '/sign-in'" class="btn mt-2 min-h-10! py-1! text-sm lg:mt-0">{{ session.current ? t("nav.openConsole") : t("nav.staffSignIn") }}</RouterLink>
        </nav>
        <div class="flex items-center gap-1 sm:gap-3">
          <LanguageSwitch class="text-ink-soft" />
          <ThemeToggle class="text-ink-soft" />
          <button class="btn-icon text-ink lg:hidden" :aria-label="t('nav.menu')" :aria-expanded="open" aria-controls="nav" @click="open = !open"><MenuIcon class="size-6" aria-hidden="true" /></button>
        </div>
      </div>
    </header>
    <main id="main" class="relative z-10"><RouterView /></main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.public-shell { position: relative; min-height: 100vh; overflow: clip; display: flex; flex-direction: column; }
.public-shell > main { flex: 1; }
/* The sweep of light from the reference. Fixed to the top of the page so every public page shares it. */
.public-shell::before {
  content: ""; position: absolute; inset: 0 0 auto; height: 58rem; pointer-events: none;
  background:
    radial-gradient(60rem 34rem at 78% 34%, var(--sweep-a, rgb(92 62 245 / 0.42)), transparent 70%),
    radial-gradient(38rem 26rem at 8% 0%, var(--sweep-b, rgb(124 77 255 / 0.26)), transparent 70%);
}
.public-shell::after {
  content: ""; position: absolute; top: 25rem; left: 34%; width: 110rem; height: 46rem; border-radius: 50%; pointer-events: none;
  background: radial-gradient(closest-side, var(--sweep-c, rgb(58 40 190 / 0.3)), transparent);
  border-top: 1px solid rgb(143 168 255 / 0.2);
}
</style>

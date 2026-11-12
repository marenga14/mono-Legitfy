<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { BadgeCheck, Building2, ClipboardList, Compass, FilePen, Landmark, FileText, Inbox, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-vue-next";
import { api, session, setSession } from "../../lib/api";
import BrandMark from "../BrandMark.vue";
import BrandWordmark from "../BrandWordmark.vue";
import { t } from "../../lib/i18n";
import LanguageSwitch from "../LanguageSwitch.vue";
import ThemeToggle from "../ThemeToggle.vue";
import ProductTour, { type TourStep } from "./ProductTour.vue";
import { hasSeenTour, markTourSeen } from "../../lib/tour";

const route = useRoute();
const router = useRouter();
const open = ref(false);
const institution = ref("");
const storage = ref<number | null>(null);
const isStaff = computed(() => session.current && session.current.role !== "platform");

const nav = computed(() => {
  const role = session.current?.role;
  if (role === "platform") return [
    { to: "/app/platform", label: t("console.nav.dashboard"), icon: LayoutDashboard, exact: true },
    { to: "/app/platform/applications", label: t("console.nav.applications"), icon: ClipboardList },
    { to: "/app/platform/changes", label: t("console.nav.changes"), icon: FilePen },
    { to: "/app/platform/institutions", label: t("console.nav.institutions"), icon: Building2 },
    { to: "/app/settings", label: t("console.nav.settings"), icon: Settings },
  ];
  return [
    { to: "/app/dashboard", label: t("console.nav.dashboard"), icon: LayoutDashboard },
    { to: "/app/inbox", label: t("console.nav.inbox"), icon: Inbox },
    ...(role === "admin" ? [
      { to: "/app/institution", label: t("console.nav.profile"), icon: Landmark },
      { to: "/app/seal", label: t("console.nav.seal"), icon: BadgeCheck },
      { to: "/app/operators", label: t("console.nav.operators"), icon: Users },
    ] : []),
    { to: "/app/documents", label: t("console.nav.documents"), icon: FileText },
    { to: "/app/settings", label: t("console.nav.settings"), icon: Settings },
  ];
});
/** Each step points at a menu item; items this role can't see are left out. */
const touring = ref(false);
const TOUR: Record<string, string> = {
  "/app/dashboard": "dashboard", "/app/inbox": "inbox", "/app/institution": "profile", "/app/seal": "seal",
  "/app/operators": "operators", "/app/documents": "documents", "/app/settings": "settings",
};
const tourSteps = computed<TourStep[]>(() => [
  { title: t("tour.introTitle"), body: session.current?.role === "admin" ? t("tour.introAdmin") : t("tour.introOperator") },
  ...nav.value.filter((item) => TOUR[item.to]).map((item) => ({
    target: `[data-tour="${item.to}"]`, title: t(`tour.${TOUR[item.to]}Title`), body: t(`tour.${TOUR[item.to]}Body`),
  })),
  { target: "[data-tour=restart]", title: t("tour.doneTitle"), body: t("tour.doneBody") },
]);
function startTour() {
  if (window.innerWidth < 1024) open.value = true; // The menu is hidden on small screens.
  touring.value = true;
}
function endTour() {
  touring.value = false;
  open.value = false;
  markTourSeen();
}

const isActive = (item: { to: string; exact?: boolean }) =>
  item.exact ? route.path === item.to : route.path.startsWith(item.to) || (item.to === "/app/inbox" && route.path.startsWith("/app/requests"));

const size = computed(() => {
  const b = storage.value ?? 0;
  if (b < 1024 ** 2) return `${Math.ceil(b / 1024)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
});

async function refreshStorage() {
  if (isStaff.value) storage.value = await api<{ storageBytes: number }>("/stats").then((s) => s.storageBytes).catch(() => null);
}
onMounted(async () => {
  if (isStaff.value) institution.value = await api<{ institution: string }>("/me").then((m) => m.institution).catch(() => "");
  refreshStorage();
  if (isStaff.value && !hasSeenTour()) startTour();
});
watch(() => route.path, () => {
  open.value = false;
  refreshStorage();
});
// An expired session clears itself in api(), wherever the failing call was made.
watch(() => session.current, (s) => {
  if (!s) router.replace("/sign-in");
});
async function signOut() {
  await router.push("/"); // Leave first, or the watcher above would send them to sign-in.
  setSession(null);
}
</script>

<template>
  <a href="#console-main" class="sr-only focus:not-sr-only focus:absolute focus:z-40 focus:bg-sheet focus:p-3">{{ t("nav.skip") }}</a>
  <div class="console-shell min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
    <div v-if="open" class="fixed inset-0 z-30 bg-harbour-deep/50 lg:hidden" @click="open = false"></div>
    <aside :class="[open ? 'flex' : 'hidden', 'fixed inset-y-0 left-0 z-40 console-side m-2 w-64 flex-col overflow-hidden lg:sticky lg:top-2 lg:flex lg:h-[calc(100vh-1rem)] lg:w-auto']">
      <div class="relative flex justify-center py-6">
        <RouterLink to="/app" class="flex items-center gap-3 text-3xl font-bold tracking-tight text-ink" :aria-label="t('console.home')"><BrandMark class="h-10 w-auto" /><BrandWordmark class="text-3xl" /></RouterLink>
        <button class="absolute right-2 top-2 rounded p-1 text-harbour lg:hidden" :aria-label="t('console.closeMenu')" @click="open = false"><X class="size-5" aria-hidden="true" /></button>
      </div>
      <nav class="mt-3 flex-1 space-y-1 overflow-y-auto px-2" :aria-label="t('console.label')">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" :data-tour="item.to" :class="['flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-colors', isActive(item) ? 'nav-active' : 'text-harbour hover:bg-periwinkle/15']" :aria-current="isActive(item) ? 'page' : undefined">
          <span class="grid size-6 place-items-center rounded-full border-2 border-current"><component :is="item.icon" class="size-3.5" aria-hidden="true" /></span>
          {{ item.label }}
        </RouterLink>
        <button v-if="isStaff" type="button" data-tour="restart" class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-harbour transition-colors hover:bg-periwinkle/15" @click="startTour">
          <span class="grid size-6 place-items-center rounded-full border-2 border-current"><Compass class="size-3.5" aria-hidden="true" /></span>
          {{ t("console.nav.tour") }}
        </button>
      </nav>
      <div v-if="storage !== null" class="panel m-3 p-4 text-harbour">
        <p class="text-sm">{{ t("console.storage") }}</p>
        <p class="text-xl font-bold">{{ size }}</p>
      </div>
    </aside>

    <div class="min-w-0">
      <header class="panel m-2 flex items-center justify-between gap-3 px-4 py-2">
        <div class="flex min-w-0 items-center gap-3">
          <button class="rounded p-1 text-harbour lg:hidden" :aria-label="t('console.openMenu')" :aria-expanded="open" @click="open = true"><Menu class="size-6" aria-hidden="true" /></button>
          <p class="min-w-0 leading-tight">
            <BrandWordmark class="block text-xl text-ink lg:hidden" />
            <span class="block truncate font-semibold text-approve">{{ isStaff ? institution : t("console.platform") }}</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2 text-harbour">
          <LanguageSwitch />
          <ThemeToggle />
          <button class="rounded p-2 hover:bg-paper-deep" :aria-label="t('console.signOut')" :title="t('console.signOut')" @click="signOut"><LogOut class="size-5" aria-hidden="true" /></button>
        </div>
      </header>
      <main id="console-main" class="m-2 p-2 sm:p-3"><RouterView :key="route.path" /></main>
    </div>
  </div>
  <ProductTour v-if="touring" :steps="tourSteps" @close="endTour" />
</template>

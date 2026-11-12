import { createRouter, createWebHistory } from "vue-router";
import { session, type Role } from "./lib/api";
import { t } from "./lib/i18n";
import { applyTheme } from "./lib/theme";

declare module "vue-router" {
  interface RouteMeta { title?: string; roles?: Role[] }
}

const page = (name: string) => () => import(`./pages/${name}.vue`);
const console_ = (name: string) => () => import(`./pages/console/${name}.vue`);
const STAFF: Role[] = ["admin", "operator"];

/** Exact, because public paths such as /apply also begin with "/app". */
export const isConsolePath = (path: string) => path === "/app" || path.startsWith("/app/");

export const homeFor = (role?: Role) => (!role ? "/sign-in" : role === "platform" ? "/app/platform" : "/app/dashboard");

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: "smooth" } : { top: 0 }),
  routes: [
    { path: "/", component: page("Home"), meta: { title: "home" } },
    { path: "/institutions", component: page("Institutions"), meta: { title: "institutions" } },
    { path: "/verifiers", component: page("Verifiers"), meta: { title: "verifiers" } },
    { path: "/developers", component: page("Developers"), meta: { title: "developers" } },
    { path: "/why", component: page("Why"), meta: { title: "why" } },
    { path: "/how-it-works", component: page("HowItWorks"), meta: { title: "how" } },
    { path: "/try", component: page("Try"), meta: { title: "try" } },
    { path: "/security", component: page("Security"), meta: { title: "security" } },
    { path: "/verify", component: page("Verify"), meta: { title: "verify" } },
    { path: "/verify/bulk", component: page("VerifyBulk"), meta: { title: "bulkCheck" } },
    { path: "/v/:id", component: page("Credential"), meta: { title: "credential" } },
    { path: "/request", component: page("RequestNew"), meta: { title: "request" } },
    { path: "/track/:token", component: page("RequestTrack"), meta: { title: "track" } },
    { path: "/shared/:token", component: page("Shared"), meta: { title: "shared" } },
    { path: "/apply", component: page("Apply"), meta: { title: "apply" } },
    { path: "/apply/:token", component: page("ApplyTrack"), meta: { title: "applyTrack" } },
    { path: "/sign-in", component: page("SignIn"), meta: { title: "signIn" } },
    {
      path: "/app",
      component: () => import("./components/console/ConsoleLayout.vue"),
      children: [
        { path: "", redirect: () => homeFor(session.current?.role) },
        { path: "dashboard", component: console_("Dashboard"), meta: { title: "dashboard", roles: STAFF } },
        { path: "inbox", component: page("Inbox"), meta: { title: "inbox", roles: STAFF } },
        { path: "requests/:id", component: page("RequestDetail"), meta: { title: "requestDetail", roles: STAFF } },
        { path: "documents", component: console_("Documents"), meta: { title: "documents", roles: STAFF } },
        { path: "documents/:id", component: console_("DocumentDetail"), meta: { title: "documentDetail", roles: STAFF } },
        { path: "operators", component: console_("Operators"), meta: { title: "operators", roles: ["admin"] } },
        { path: "seal", component: console_("SealEditor"), meta: { title: "sealEditor", roles: ["admin"] } },
        { path: "institution", component: console_("InstitutionProfile"), meta: { title: "institutionProfile", roles: ["admin"] } },
        { path: "settings", component: console_("Settings"), meta: { title: "settings", roles: ["platform", ...STAFF] } },
        { path: "platform", component: console_("PlatformDashboard"), meta: { title: "dashboard", roles: ["platform"] } },
        { path: "platform/applications", component: console_("PlatformApplications"), meta: { title: "platformApplications", roles: ["platform"] } },
        { path: "platform/applications/:id", component: console_("PlatformApplicationDetail"), meta: { title: "platformApplications", roles: ["platform"] } },
        { path: "platform/changes", component: console_("PlatformChanges"), meta: { title: "platformChanges", roles: ["platform"] } },
        { path: "platform/institutions", component: console_("PlatformInstitutions"), meta: { title: "platformInstitutions", roles: ["platform"] } },
      ],
    },
    { path: "/:rest(.*)*", component: page("NotFound"), meta: { title: "notFound" } },
  ],
});

// A convenience only: the API checks the role on every call.
router.beforeEach((to) => {
  document.documentElement.classList.toggle("theme-console", isConsolePath(to.path));
  applyTheme();
  const roles = to.meta.roles;
  if (!roles) return;
  const role = session.current?.role;
  if (!role) return { path: "/sign-in", query: { next: to.fullPath } };
  if (!roles.includes(role)) return homeFor(role);
});
export function showTitle(key: string) {
  document.title = key === "home" ? "Legitfy" : `${t(`titles.${key}`)} | Legitfy`;
}
router.afterEach((to) => {
  showTitle(to.meta.title ?? "home");
  forgetReload();
});

// A tab left open across a release asks for page files that no longer exist, and the click would
// silently do nothing. Load that page fresh instead, once, so a real outage can't cause a reload loop.
const RELOADED = "legitify.reloaded";
const STALE_FILE = /dynamically imported module|importing a module script failed|unable to preload/i;
function forgetReload() {
  try { sessionStorage.removeItem(RELOADED); } catch { /* Private windows can refuse storage. */ }
}
function firstReloadOf(path: string) {
  try {
    if (sessionStorage.getItem(RELOADED) === path) return false;
    sessionStorage.setItem(RELOADED, path);
    return true;
  } catch {
    return false;
  }
}
router.onError((error: Error, to) => {
  if (STALE_FILE.test(error.message) && firstReloadOf(to.fullPath)) window.location.assign(to.fullPath);
});

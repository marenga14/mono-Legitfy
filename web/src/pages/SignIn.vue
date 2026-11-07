<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, setSession, type Session } from "../lib/api";
import { t } from "../lib/i18n";
import { homeFor } from "../router";

declare global {
  interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> } }
}
const router = useRouter();
const route = useRoute();
const error = ref("");
const busy = ref(false);
const hasWallet = Boolean(window.ethereum);

async function signIn() {
  error.value = "";
  busy.value = true;
  try {
    const [address] = await window.ethereum!.request({ method: "eth_requestAccounts" });
    const { nonce, message } = await api<{ nonce: string; message: string }>("/auth/challenge", { method: "POST" });
    const signature = await window.ethereum!.request({ method: "personal_sign", params: [message, address] });
    const signedIn = await api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ nonce, signature }) });
    setSession(signedIn);
    const next = router.resolve(String(route.query.next ?? ""));
    router.push(next.meta.roles?.includes(signedIn.role) ? next.fullPath : homeFor(signedIn.role));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="glass mx-auto mt-14 max-w-md p-8">
    <h1 class="text-4xl">{{ t("signIn.title") }}</h1>
    <p class="mt-3 text-ink-soft">{{ t("signIn.sub") }}</p>
    <button class="btn mt-6" :disabled="!hasWallet || busy" @click="signIn">{{ busy ? t("common.waitingWallet") : t("signIn.button") }}</button>
    <p v-if="!hasWallet" class="mt-4 text-ink-soft">{{ t("signIn.noWallet") }}</p>
    <p v-if="error" class="mt-4 text-seal" role="alert">{{ error }}</p>
    <p class="mt-6 text-ink-soft">{{ t("signIn.newHere") }} <RouterLink to="/apply" class="link">{{ t("institutions.apply") }}</RouterLink></p>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import VerifyConsole from "../components/VerifyConsole.vue";
import { t } from "../lib/i18n";
import { resolveCredential } from "../lib/registry";

const router = useRouter();
const entered = ref("");
const mistyped = ref(false);
function lookUp() {
  const found = resolveCredential(entered.value);
  mistyped.value = !found;
  if (found) router.push(`/v/${found.code ?? found.id}`);
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-10">
    <h1 class="text-center text-5xl">{{ t("verify.title") }}</h1>
    <div class="mt-8"><VerifyConsole /></div>
    <form class="mx-auto mt-8 max-w-md" @submit.prevent="lookUp">
      <label class="block" for="certificate-id">{{ t("verify.codeLabel") }}</label>
      <div class="mt-1 flex gap-2">
        <input id="certificate-id" v-model="entered" class="field hash min-w-0 flex-1" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="UD-26-7K4Q9-XPM2C" />
        <button class="btn">{{ t("verify.codeCheck") }}</button>
      </div>
      <p v-if="mistyped" class="mt-2 text-seal" role="alert">{{ t("verify.codeBad") }}</p>
    </form>
    <p class="mt-6 text-center"><RouterLink to="/verify/bulk" class="link">{{ t("bulk.link") }}</RouterLink></p>
  </section>
</template>

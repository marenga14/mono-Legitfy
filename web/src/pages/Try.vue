<script setup lang="ts">
import { chainId, explorerUrl, networkName, shownChainId, shownRegistry, supportEmail } from "../lib/config";
import { t } from "../lib/i18n";

/** Deployed alongside the registry on BOT Chain mainnet; not read from the API. */
const auditAnchor = chainId === 677 ? "0x32b72ddF7d1D5fE11DAa371f0255c585051E41Aa" : undefined;
const publish = [1, 2, 3, 4, 5];
const check = [1, 2, 3];
</script>

<template>
  <section class="mx-auto max-w-5xl px-6 py-14">
    <h1 class="text-6xl">{{ t("try.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("try.sub") }}</p>
    <p class="mt-4 max-w-2xl text-ink-soft">{{ t("try.independent", { network: networkName }) }}</p>

    <h2 class="mt-14 text-3xl">{{ t("try.publishTitle") }}</h2>
    <ol class="mt-5 max-w-3xl space-y-4">
      <li v-for="n in publish" :key="n" class="glass flex gap-4 p-5">
        <span class="font-bold text-ink-soft">{{ n }}</span>
        <p>{{ t(`try.publish${n}`, { network: networkName }) }}</p>
      </li>
    </ol>
    <RouterLink to="/apply" class="btn mt-6">{{ t("institutions.apply") }}</RouterLink>

    <h2 class="mt-14 text-3xl">{{ t("try.checkTitle") }}</h2>
    <ol class="mt-5 max-w-3xl space-y-4">
      <li v-for="n in check" :key="n" class="glass flex gap-4 p-5">
        <span class="font-bold text-ink-soft">{{ n }}</span>
        <p>{{ t(`try.check${n}`) }}</p>
      </li>
    </ol>
    <RouterLink to="/verify" class="btn btn-quiet mt-6">{{ t("hero.cta") }}</RouterLink>

    <h2 class="mt-14 text-3xl">{{ t("try.contractsTitle") }}</h2>
    <dl class="mt-4 space-y-2">
      <div class="grid sm:grid-cols-[10rem_1fr]"><dt class="text-ink-soft">{{ t("developers.network") }}</dt><dd>{{ t("developers.networkValue", { network: networkName, id: shownChainId }) }}</dd></div>
      <div class="grid sm:grid-cols-[10rem_1fr]">
        <dt class="text-ink-soft">{{ t("developers.registry") }}</dt>
        <dd v-if="shownRegistry" class="hash break-all"><a class="link" :href="`${explorerUrl}/address/${shownRegistry}`" target="_blank" rel="noopener">{{ shownRegistry }}</a></dd>
        <dd v-else>{{ t("developers.notDeployed") }}</dd>
      </div>
      <div v-if="auditAnchor" class="grid sm:grid-cols-[10rem_1fr]">
        <dt class="text-ink-soft">{{ t("try.auditAnchor") }}</dt>
        <dd class="hash break-all"><a class="link" :href="`${explorerUrl}/address/${auditAnchor}`" target="_blank" rel="noopener">{{ auditAnchor }}</a></dd>
      </div>
    </dl>
    <p class="mt-8 text-ink-soft">{{ t("try.help") }} <a class="link" :href="`mailto:${supportEmail}`">{{ supportEmail }}</a></p>
  </section>
</template>
